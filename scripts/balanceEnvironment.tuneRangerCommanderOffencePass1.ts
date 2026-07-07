import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const TARGET_CHARACTER_NAME = "BALANCE_Ranger Commander";
const TARGET_WEAPON_ID = "balance-commander-bow";
const TARGET_WEAPON_NAME = "BALANCE_Commander Bow";

const COMMANDER_BOW_TARGET_STRENGTH = 1.5;
const COMMANDER_BOW_ALLOWED_BEFORE = new Set([2, COMMANDER_BOW_TARGET_STRENGTH]);
const KILLBOX_TARGET_POTENCY = 3;
const KILLBOX_REJECTED_PASS2_POTENCY = 2;
const KILLBOX_ALLOWED_BEFORE = new Set([4, KILLBOX_TARGET_POTENCY, KILLBOX_REJECTED_PASS2_POTENCY]);
const MARKED_VOLLEY_EXPECTED_POTENCY = 3;

type JsonRecord = Record<string, unknown>;

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

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}: expected object.`);
  }
  return value as JsonRecord;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function numeric(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}: expected finite number, found ${String(value)}.`);
  return parsed;
}

function combatLabWoundsPerSuccessFromItemStrength(value: number) {
  return value * 2;
}

function combatLabWoundsPerSuccessFromPowerPotency(value: number) {
  return value * 2;
}

function summarizePower(power: JsonRecord | null) {
  if (!power) return null;
  const packet = Array.isArray(power.effectPackets) ? asRecord(power.effectPackets[0], `${power.name}.effectPackets[0]`) : null;
  return {
    name: power.name,
    diceCount: power.diceCount,
    potency: power.potency,
    packetPotency: packet?.potency,
    combatLabWoundsPerSuccess: combatLabWoundsPerSuccessFromPowerPotency(numeric(power.potency, `${power.name}.potency`)),
    cooldownTurns: power.cooldownTurns,
    rangeCategories: power.rangeCategories,
    rangedDistanceFeet: power.rangedDistanceFeet,
    durationType: power.durationType,
    effectDurationType: power.effectDurationType,
    effectDurationTurns: power.effectDurationTurns,
  };
}

function findPower(builderData: JsonRecord, name: string): JsonRecord | null {
  const powers = Array.isArray(builderData.powers) ? builderData.powers : [];
  const match = powers.find((entry) => asRecord(entry, `powers entry`).name === name);
  return match ? asRecord(match, name) : null;
}

function updatePowerPotency(power: JsonRecord, name: string, targetPotency: number, allowedBefore: Set<number>) {
  const beforePotency = numeric(power.potency, `${name}.potency`);
  if (!allowedBefore.has(beforePotency)) {
    throw new Error(`${name}: refusing unexpected potency ${beforePotency}.`);
  }

  const updatePackets = (value: unknown, label: string) => {
    if (!Array.isArray(value)) throw new Error(`${label}: expected packet array.`);
    return value.map((entry, index) => {
      const packet = asRecord(entry, `${label}[${index}]`);
      if (index !== 0) return packet;
      const packetPotency = numeric(packet.potency, `${label}[0].potency`);
      if (!allowedBefore.has(packetPotency)) {
        throw new Error(`${label}[0]: refusing unexpected potency ${packetPotency}.`);
      }
      return { ...packet, potency: targetPotency };
    });
  };

  return {
    ...power,
    potency: targetPotency,
    effectPackets: updatePackets(power.effectPackets, `${name}.effectPackets`),
    intentions: updatePackets(power.intentions, `${name}.intentions`),
  };
}

async function main() {
  loadLocalEnv();
  const prismaModule = await import("../prisma/client");
  const prisma = prismaModule.prisma;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: BALANCE_CAMPAIGN_ID },
      select: { id: true, name: true },
    });
    if (!campaign) throw new Error(`Campaign ${BALANCE_CAMPAIGN_ID} was not found.`);
    if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
      throw new Error(`Campaign name mismatch: expected ${BALANCE_CAMPAIGN_NAME}, found ${campaign.name}.`);
    }

    const ranger = await prisma.campaignCharacter.findFirst({
      where: {
        campaignId: BALANCE_CAMPAIGN_ID,
        name: TARGET_CHARACTER_NAME,
        archivedAt: null,
      },
      include: {
        backpackItems: {
          include: {
            partyInventoryItem: { include: { itemTemplate: true } },
          },
        },
      },
    });
    if (!ranger) throw new Error(`${TARGET_CHARACTER_NAME}: expected existing Balance Environment character.`);
    if (ranger.campaignId !== BALANCE_CAMPAIGN_ID) throw new Error(`${TARGET_CHARACTER_NAME}: campaign mismatch.`);

    const commanderBowBackpackItems = ranger.backpackItems.filter(
      (entry) => entry.partyInventoryItem.itemTemplate.id === TARGET_WEAPON_ID,
    );
    if (commanderBowBackpackItems.length !== 1) {
      throw new Error(`${TARGET_CHARACTER_NAME}: expected exactly one ${TARGET_WEAPON_ID} backpack item, found ${commanderBowBackpackItems.length}.`);
    }
    const commanderBow = commanderBowBackpackItems[0].partyInventoryItem.itemTemplate;
    if (commanderBow.campaignId !== BALANCE_CAMPAIGN_ID) throw new Error(`${TARGET_WEAPON_NAME}: campaign mismatch.`);
    if (commanderBow.name !== TARGET_WEAPON_NAME || commanderBow.type !== "WEAPON") {
      throw new Error(`${TARGET_WEAPON_ID}: refusing unexpected item ${commanderBow.name} / ${commanderBow.type}.`);
    }
    const beforeBowStrength = numeric(commanderBow.rangedPhysicalStrength, `${TARGET_WEAPON_NAME}.rangedPhysicalStrength`);
    if (!COMMANDER_BOW_ALLOWED_BEFORE.has(beforeBowStrength)) {
      throw new Error(`${TARGET_WEAPON_NAME}: refusing unexpected rangedPhysicalStrength ${beforeBowStrength}.`);
    }

    const beforeBuilderData = asRecord(ranger.builderData, `${TARGET_CHARACTER_NAME}.builderData`);
    const nextBuilderData = cloneJson(beforeBuilderData);
    const markedVolley = findPower(nextBuilderData, "Marked Volley");
    if (!markedVolley) throw new Error(`${TARGET_CHARACTER_NAME}: Marked Volley not found.`);
    if (numeric(markedVolley.potency, "Marked Volley.potency") !== MARKED_VOLLEY_EXPECTED_POTENCY) {
      throw new Error(`Marked Volley: expected untouched potency ${MARKED_VOLLEY_EXPECTED_POTENCY}.`);
    }

    const signatureMove = asRecord(nextBuilderData.signatureMove, `${TARGET_CHARACTER_NAME}.signatureMove`);
    if (signatureMove.name !== "Killbox Command") {
      throw new Error(`${TARGET_CHARACTER_NAME}: expected Killbox Command signature move, found ${String(signatureMove.name)}.`);
    }
    const beforeKillbox = summarizePower(signatureMove);
    nextBuilderData.signatureMove = updatePowerPotency(
      signatureMove,
      "Killbox Command",
      KILLBOX_TARGET_POTENCY,
      KILLBOX_ALLOWED_BEFORE,
    );

    const before = {
      character: {
        id: ranger.id,
        campaignId: ranger.campaignId,
        name: ranger.name,
        level: ranger.level,
      },
      hpContextUnchanged: {
        note: "CampaignCharacter has no current/max HP fields; runtime HP is derived from builder data/equipment and is not changed by this pass.",
      },
      commanderBow: {
        id: commanderBow.id,
        name: commanderBow.name,
        rangedPhysicalStrength: commanderBow.rangedPhysicalStrength,
        combatLabWoundsPerSuccess: combatLabWoundsPerSuccessFromItemStrength(beforeBowStrength),
        rangedTargets: commanderBow.rangedTargets,
        rangedDistanceFeet: commanderBow.rangedDistanceFeet,
        type: commanderBow.type,
        size: commanderBow.size,
      },
      commandShot: summarizePower(findPower(nextBuilderData, "Command Shot")),
      markedVolley: summarizePower(markedVolley),
      killboxCommand: beforeKillbox,
    };

    const [afterBow, afterRanger] = await prisma.$transaction([
      prisma.itemTemplate.update({
        where: { id: commanderBow.id },
        data: { rangedPhysicalStrength: COMMANDER_BOW_TARGET_STRENGTH },
        select: {
          id: true,
          campaignId: true,
          name: true,
          type: true,
          size: true,
          rangedTargets: true,
          rangedDistanceFeet: true,
          rangedPhysicalStrength: true,
        },
      }),
      prisma.campaignCharacter.update({
        where: { id: ranger.id },
        data: { builderData: nextBuilderData as Prisma.InputJsonValue },
        select: { id: true, campaignId: true, name: true, level: true, builderData: true },
      }),
    ]);

    if (afterBow.campaignId !== BALANCE_CAMPAIGN_ID || afterBow.id !== TARGET_WEAPON_ID) {
      throw new Error(`${TARGET_WEAPON_NAME}: post-update scope verification failed.`);
    }
    if (afterRanger.campaignId !== BALANCE_CAMPAIGN_ID || afterRanger.name !== TARGET_CHARACTER_NAME) {
      throw new Error(`${TARGET_CHARACTER_NAME}: post-update scope verification failed.`);
    }
    const afterBuilderData = asRecord(afterRanger.builderData, `${TARGET_CHARACTER_NAME}.afterBuilderData`);
    const afterKillbox = asRecord(afterBuilderData.signatureMove, `${TARGET_CHARACTER_NAME}.afterSignatureMove`);

    const after = {
      character: {
        id: afterRanger.id,
        campaignId: afterRanger.campaignId,
        name: afterRanger.name,
        level: afterRanger.level,
      },
      hpContextUnchanged: before.hpContextUnchanged,
      commanderBow: {
        id: afterBow.id,
        name: afterBow.name,
        rangedPhysicalStrength: afterBow.rangedPhysicalStrength,
        combatLabWoundsPerSuccess: combatLabWoundsPerSuccessFromItemStrength(
          numeric(afterBow.rangedPhysicalStrength, `${TARGET_WEAPON_NAME}.after.rangedPhysicalStrength`),
        ),
        rangedTargets: afterBow.rangedTargets,
        rangedDistanceFeet: afterBow.rangedDistanceFeet,
        type: afterBow.type,
        size: afterBow.size,
      },
      commandShot: summarizePower(findPower(afterBuilderData, "Command Shot")),
      markedVolley: summarizePower(findPower(afterBuilderData, "Marked Volley")),
      killboxCommand: summarizePower(afterKillbox),
    };

    console.log("Balance Environment Ranger Commander offence tuning pass 1 complete.");
    console.log(`campaignId: ${BALANCE_CAMPAIGN_ID}`);
    console.log(`campaignName: ${BALANCE_CAMPAIGN_NAME}`);
    console.log("DB mutation: scoped offence-only update for BALANCE_Ranger Commander and BALANCE_Commander Bow.");
    console.log("Changed fields: ItemTemplate.rangedPhysicalStrength for BALANCE_Commander Bow; CampaignCharacter.builderData.signatureMove Killbox Command potency/effectPackets[0].potency/intentions[0].potency.");
    if (numeric(beforeKillbox?.potency, "Killbox Command.before.potency") === KILLBOX_REJECTED_PASS2_POTENCY) {
      console.log("Restore note: Killbox Command was in known rejected pass-2 potency 2 state and was restored to accepted pass-1 potency 3.");
    }
    console.log("Untouched: Marked Volley, Command Shot, Ranger durability, Hawkshot, Stoneguard, Arcane Sage, target monsters, calibration assets, runtime code, formula/scalar/tuning rows.");
    console.log(JSON.stringify({ before, after }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
