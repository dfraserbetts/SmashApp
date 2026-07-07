import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cleanBuilderTraits,
  defaultBuilderData,
  normalizeBuilderData,
  sanitizeBuilderEquipment,
  validateBuilderData,
  type CharacterAttribute,
  type CharacterBuilderData,
  type PlayerTraitDefinition,
} from "../lib/characterBuilder/core";
import {
  signatureMovePointPool,
  validateCharacterPowers,
} from "../lib/characterBuilder/powers";
import { adaptCampaignCharacterToCombatActor } from "../lib/combat-lab/liveAdapters";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;

type AttributeProfile = Record<CharacterAttribute, number>;

type CharacterShell = {
  name: string;
  role: string;
  description: string;
  attributes: AttributeProfile;
  resistPoints: AttributeProfile;
};

const CHARACTER_SHELLS: CharacterShell[] = [
  {
    name: "BALANCE_Arcane Sage",
    role: "Support-controller / arcane utility calibration character.",
    description: "Strong Mental lane support/control shell with lower physical durability.",
    attributes: {
      Attack: 4,
      Guard: 8,
      Fortitude: 6,
      Intellect: 12,
      Synergy: 10,
      Bravery: 8,
    },
    resistPoints: {
      Attack: 0,
      Guard: 0,
      Fortitude: 0,
      Intellect: 2,
      Synergy: 1,
      Bravery: 1,
    },
  },
  {
    name: "BALANCE_Ranger Commander",
    role: "Versatile martial/generalist calibration character.",
    description: "Balanced physical leader shell with moderate mental resilience.",
    attributes: {
      Attack: 12,
      Guard: 10,
      Fortitude: 8,
      Intellect: 6,
      Synergy: 4,
      Bravery: 8,
    },
    resistPoints: {
      Attack: 1,
      Guard: 1,
      Fortitude: 1,
      Intellect: 0,
      Synergy: 0,
      Bravery: 1,
    },
  },
  {
    name: "BALANCE_Stoneguard",
    role: "Durable melee tank calibration character.",
    description: "Physical Block/Fortitude/Defence shell with low versatility.",
    attributes: {
      Attack: 8,
      Guard: 12,
      Fortitude: 10,
      Intellect: 4,
      Synergy: 6,
      Bravery: 8,
    },
    resistPoints: {
      Attack: 0,
      Guard: 2,
      Fortitude: 2,
      Intellect: 0,
      Synergy: 0,
      Bravery: 0,
    },
  },
  {
    name: "BALANCE_Hawkshot Archer",
    role: "Ranged precision striker / glass cannon calibration character.",
    description: "High Attack precision shell with lower durability.",
    attributes: {
      Attack: 12,
      Guard: 10,
      Fortitude: 6,
      Intellect: 8,
      Synergy: 4,
      Bravery: 8,
    },
    resistPoints: {
      Attack: 2,
      Guard: 1,
      Fortitude: 0,
      Intellect: 0,
      Synergy: 0,
      Bravery: 1,
    },
  },
];

function loadEnvFile(relativePath: string) {
  const absolutePath = join(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) return;
  const text = readFileSync(absolutePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
}

function balanceMetadata(shell: CharacterShell) {
  return [
    "BALANCE_STATUS: Experimental",
    "BALANCE_SOURCE: Balance Environment calibration",
    `BALANCE_ROLE: ${shell.role}`,
    "BALANCE_NOTES: Baseline calibration shell, not final tuned pregen.",
  ].join("\n");
}

function makeBuilderData(shell: CharacterShell, traitCatalog: PlayerTraitDefinition[]): CharacterBuilderData {
  const base = defaultBuilderData();
  const withShellData: CharacterBuilderData = {
    ...base,
    narrativeNotes: `${balanceMetadata(shell)}\n\n${shell.description}`,
    attributeMethod: "HEROIC",
    attributes: { ...shell.attributes },
    resistPoints: { ...shell.resistPoints },
    selectedTraitKeys: [],
    equippedSlots: {},
    signatureMove: null,
    powers: [],
  };
  return sanitizeBuilderEquipment(
    cleanBuilderTraits(normalizeBuilderData(withShellData), traitCatalog),
    [],
  );
}

function validateShellBuilderData(
  shell: CharacterShell,
  builderData: CharacterBuilderData,
  traitCatalog: PlayerTraitDefinition[],
) {
  return [
    ...validateBuilderData(builderData, LEVEL, traitCatalog),
    ...validateCharacterPowers({
      level: LEVEL,
      powers: builderData.powers,
    }),
    ...validateCharacterPowers({
      level: LEVEL,
      powers: builderData.signatureMove ? [builderData.signatureMove] : [],
      powerPool: signatureMovePointPool(LEVEL),
      powerLabel: "Signature Move",
      poolDescription: "Character Level x 20",
      offencePressureMode: "reviewOnly",
    }),
  ].map((error) => `${shell.name}: ${error}`);
}

async function main() {
  loadLocalEnv();
  const prismaModule = await import("../prisma/client");
  const prisma = prismaModule.prisma;

  const initialCounts = await Promise.all([
    prisma.campaignCharacter.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    prisma.monster.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    prisma.itemTemplate.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
  ]);

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: BALANCE_CAMPAIGN_ID },
      select: { id: true, name: true },
    });
    if (!campaign) {
      throw new Error(`Campaign ${BALANCE_CAMPAIGN_ID} was not found.`);
    }
    if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
      throw new Error(
        `Campaign name mismatch for ${BALANCE_CAMPAIGN_ID}: expected "${BALANCE_CAMPAIGN_NAME}", found "${campaign.name}".`,
      );
    }

    const traitRows = await prisma.playerTrait.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        descriptor: true,
        classification: true,
        pointValue: true,
        isActive: true,
      },
    });
    const traitCatalog = traitRows.map((row) => ({
      id: row.id,
      name: row.name,
      descriptor: row.descriptor,
      classification: row.classification,
      pointValue: row.pointValue,
      isActive: row.isActive,
    })) satisfies PlayerTraitDefinition[];

    const outputs: Array<{
      action: "created" | "updated";
      id: string;
      name: string;
      level: number;
      attributes: AttributeProfile;
      resistPoints: AttributeProfile;
      hydrationWarnings: string[];
      actionCount: number;
    }> = [];

    for (const shell of CHARACTER_SHELLS) {
      const existingRows = await prisma.campaignCharacter.findMany({
        where: {
          campaignId: BALANCE_CAMPAIGN_ID,
          name: shell.name,
        },
        select: { id: true },
      });
      if (existingRows.length > 1) {
        throw new Error(
          `Refusing to update ${shell.name}: found ${existingRows.length} duplicate records in ${BALANCE_CAMPAIGN_NAME}.`,
        );
      }

      const builderData = makeBuilderData(shell, traitCatalog);
      const validationErrors = validateShellBuilderData(shell, builderData, traitCatalog);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join("\n"));
      }

      const data = {
        name: shell.name,
        level: LEVEL,
        description: `${balanceMetadata(shell)}\n\n${shell.description}`,
        builderData: JSON.parse(JSON.stringify(builderData)),
        archivedAt: null,
        archivedByUserId: null,
        archiveReason: null,
      };

      const record = existingRows[0]
        ? await prisma.campaignCharacter.update({
            where: { id: existingRows[0].id },
            data,
            select: {
              id: true,
              name: true,
              level: true,
              builderData: true,
            },
          })
        : await prisma.campaignCharacter.create({
            data: {
              campaignId: BALANCE_CAMPAIGN_ID,
              assignedUserId: null,
              ...data,
            },
            select: {
              id: true,
              name: true,
              level: true,
              builderData: true,
            },
          });

      const hydration = adaptCampaignCharacterToCombatActor({
        id: record.id,
        name: record.name,
        level: record.level,
        builderData: record.builderData,
        backpackItems: [],
      });

      outputs.push({
        action: existingRows[0] ? "updated" : "created",
        id: record.id,
        name: record.name,
        level: record.level,
        attributes: shell.attributes,
        resistPoints: shell.resistPoints,
        hydrationWarnings: hydration.warnings.map((warning) => warning.message),
        actionCount: hydration.actor.actions.length,
      });
    }

    const finalRows = await prisma.campaignCharacter.findMany({
      where: {
        campaignId: BALANCE_CAMPAIGN_ID,
        name: { in: CHARACTER_SHELLS.map((shell) => shell.name) },
      },
      select: {
        id: true,
        name: true,
        archivedAt: true,
        level: true,
        builderData: true,
      },
      orderBy: { name: "asc" },
    });
    if (finalRows.length !== CHARACTER_SHELLS.length) {
      throw new Error(`Expected ${CHARACTER_SHELLS.length} balance characters, found ${finalRows.length}.`);
    }
    const archived = finalRows.filter((row) => row.archivedAt !== null);
    if (archived.length > 0) {
      throw new Error(`Expected no archived balance characters, found: ${archived.map((row) => row.name).join(", ")}`);
    }

    for (const row of finalRows) {
      const shell = CHARACTER_SHELLS.find((entry) => entry.name === row.name);
      if (!shell) throw new Error(`Unexpected character row returned: ${row.name}`);
      const builderData = sanitizeBuilderEquipment(
        cleanBuilderTraits(normalizeBuilderData(row.builderData), traitCatalog),
        [],
      );
      const validationErrors = validateShellBuilderData(shell, builderData, traitCatalog);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join("\n"));
      }
    }

    const finalCounts = await Promise.all([
      prisma.campaignCharacter.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      prisma.monster.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      prisma.itemTemplate.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    ]);
    if (finalCounts[1] !== initialCounts[1]) {
      throw new Error(`Monster count changed from ${initialCounts[1]} to ${finalCounts[1]}; abort review.`);
    }
    if (finalCounts[2] !== initialCounts[2]) {
      throw new Error(`ItemTemplate count changed from ${initialCounts[2]} to ${finalCounts[2]}; abort review.`);
    }

    console.log(JSON.stringify({
      campaignId: BALANCE_CAMPAIGN_ID,
      campaignName: BALANCE_CAMPAIGN_NAME,
      initialCounts: {
        characters: initialCounts[0],
        monsters: initialCounts[1],
        itemTemplates: initialCounts[2],
      },
      finalCounts: {
        characters: finalCounts[0],
        monsters: finalCounts[1],
        itemTemplates: finalCounts[2],
      },
      characters: outputs,
      placeholderPowersCreated: false,
      equipmentCreatedOrEquipped: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
