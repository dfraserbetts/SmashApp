import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cleanBuilderTraits,
  normalizeBuilderData,
  sanitizeBuilderEquipment,
  validateBuilderData,
  type CharacterBuilderData,
  type PlayerTraitDefinition,
} from "../lib/characterBuilder/core";
import {
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  normalizeCharacterPower,
  signatureMovePointPool,
  summarizeCharacterPowers,
  validateCharacterPowers,
  type CharacterPower,
} from "../lib/characterBuilder/powers";
import {
  DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
  normalizeCharacterPowerSpendScalar,
} from "../lib/config/characterBuilderTuningShared";
import {
  DEFAULT_POWER_TUNING_VALUES,
  normalizePowerTuningValues,
  type PowerTuningSnapshot,
} from "../lib/config/powerTuningShared";
import { adaptCampaignCharacterToCombatActor } from "../lib/combat-lab/liveAdapters";
import type {
  CoreAttribute,
  EffectDurationType,
  EffectPacketApplyTo,
  PowerIntention,
  RangeCategory,
  WoundChannel,
} from "../lib/summoning/types";

const BALANCE_CAMPAIGN_ID = "250aee5e-632f-405c-ba36-a49ed12a5afc";
const BALANCE_CAMPAIGN_NAME = "Balance Environment";
const LEVEL = 3;

type PowerSpec = {
  id: string;
  name: string;
  description: string;
  intention: PowerIntention;
  diceCount: number;
  potency: number;
  rangeCategory: "SELF" | RangeCategory;
  rangeValue: number;
  rangeExtra?: Record<string, unknown>;
  applyTo?: EffectPacketApplyTo;
  durationType?: EffectDurationType;
  durationTurns?: number | null;
  attackMode?: WoundChannel;
  damageTypes?: string[];
  defenceMode?: "Block" | "Dodge" | "Resist";
  resistedAttribute?: CoreAttribute;
  statTarget?: CoreAttribute;
  healingMode?: WoundChannel;
  movementMode?: string;
  controlMode?: string;
  controlTheme?: string;
  cleanseEffectType?: string;
};

type CharacterKit = {
  name: string;
  powers: PowerSpec[];
};

const CHARACTER_KITS: CharacterKit[] = [
  {
    name: "BALANCE_Arcane Sage",
    powers: [
      {
        id: "balance-arcane-sage-mind-spark",
        name: "Mind Spark",
        description: "A modest mental strike used as the Sage's reliable primary action.",
        intention: "ATTACK",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        attackMode: "MENTAL",
        damageTypes: ["Psychic"],
      },
      {
        id: "balance-arcane-sage-guiding-sigil",
        name: "Guiding Sigil",
        description: "A light ally Attack augment for support and Assist calibration.",
        intention: "AUGMENT",
        diceCount: 1,
        potency: 1,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        applyTo: "ALLIES",
        durationType: "TURNS",
        durationTurns: 1,
        statTarget: "ATTACK",
      },
      {
        id: "balance-arcane-sage-mending-word",
        name: "Mending Word",
        description: "A small ranged physical healing utility.",
        intention: "HEALING",
        diceCount: 1,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        applyTo: "ALLIES",
        healingMode: "PHYSICAL",
      },
    ],
  },
  {
    name: "BALANCE_Ranger Commander",
    powers: [
      {
        id: "balance-ranger-commander-command-shot",
        name: "Command Shot",
        description: "A straightforward ranged physical attack.",
        intention: "ATTACK",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        attackMode: "PHYSICAL",
        damageTypes: ["Pierce"],
      },
      {
        id: "balance-ranger-commander-rallying-order",
        name: "Rallying Order",
        description: "A leadership Guard augment for one ally.",
        intention: "AUGMENT",
        diceCount: 1,
        potency: 1,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        applyTo: "ALLIES",
        durationType: "TURNS",
        durationTurns: 1,
        statTarget: "GUARD",
      },
      {
        id: "balance-ranger-commander-tactical-step",
        name: "Tactical Step",
        description: "A self movement utility for tactical repositioning.",
        intention: "MOVEMENT",
        diceCount: 1,
        potency: 1,
        rangeCategory: "SELF",
        rangeValue: 0,
        applyTo: "SELF",
        movementMode: "Run",
      },
    ],
  },
  {
    name: "BALANCE_Stoneguard",
    powers: [
      {
        id: "balance-stoneguard-shield-bash",
        name: "Shield Bash",
        description: "A simple melee physical attack.",
        intention: "ATTACK",
        diceCount: 2,
        potency: 2,
        rangeCategory: "MELEE",
        rangeValue: 1,
        attackMode: "PHYSICAL",
        damageTypes: ["Blunt"],
      },
      {
        id: "balance-stoneguard-stone-stance",
        name: "Stone Stance",
        description: "A self physical Block defensive pool for frontline endurance.",
        intention: "DEFENCE",
        diceCount: 1,
        potency: 2,
        rangeCategory: "SELF",
        rangeValue: 0,
        applyTo: "SELF",
        durationType: "TURNS",
        durationTurns: 2,
        attackMode: "PHYSICAL",
        defenceMode: "Block",
      },
      {
        id: "balance-stoneguard-enduring-breath",
        name: "Enduring Breath",
        description: "A small self physical heal/sustain tool.",
        intention: "HEALING",
        diceCount: 1,
        potency: 2,
        rangeCategory: "SELF",
        rangeValue: 0,
        applyTo: "SELF",
        healingMode: "PHYSICAL",
      },
    ],
  },
  {
    name: "BALANCE_Hawkshot Archer",
    powers: [
      {
        id: "balance-hawkshot-archer-pinning-shot",
        name: "Pinning Shot",
        description: "A clean ranged physical strike for precision baseline testing.",
        intention: "ATTACK",
        diceCount: 3,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 60,
        rangeExtra: { targets: 1 },
        attackMode: "PHYSICAL",
        damageTypes: ["Pierce"],
      },
      {
        id: "balance-hawkshot-archer-evasive-roll",
        name: "Evasive Roll",
        description: "A short self Dodge defensive pool using guard footwork.",
        intention: "DEFENCE",
        diceCount: 1,
        potency: 1,
        rangeCategory: "SELF",
        rangeValue: 0,
        applyTo: "SELF",
        durationType: "TURNS",
        durationTurns: 1,
        attackMode: "PHYSICAL",
        defenceMode: "Dodge",
      },
      {
        id: "balance-hawkshot-archer-mark-the-gap",
        name: "Mark the Gap",
        description: "A light Guard debuff for precision pressure tests.",
        intention: "DEBUFF",
        diceCount: 1,
        potency: 1,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        durationType: "TURNS",
        durationTurns: 1,
        statTarget: "GUARD",
      },
    ],
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

function balanceMetadata(characterName: string) {
  const kit = CHARACTER_KITS.find((entry) => entry.name === characterName);
  const role = kit?.name.replace("BALANCE_", "") ?? characterName;
  return [
    "BALANCE_STATUS: Experimental",
    "BALANCE_SOURCE: Balance Environment calibration",
    `BALANCE_ROLE: ${role}`,
    "BALANCE_PHASE: First-pass power kit",
    "BALANCE_NOTES: Experimental calibration kit; not final tuned pregen.",
  ].join("\n");
}

function packetDetails(spec: PowerSpec) {
  const details: Record<string, unknown> = {
    rangeCategory: spec.rangeCategory,
    rangeValue: spec.rangeValue,
    rangeExtra: spec.rangeExtra ?? {},
  };
  if (spec.intention === "ATTACK") {
    details.attackMode = spec.attackMode ?? "PHYSICAL";
    details.damageTypes = spec.damageTypes ?? ["Blunt"];
  }
  if (spec.intention === "DEFENCE") {
    details.attackMode = spec.attackMode ?? "PHYSICAL";
    details.defenceMode = spec.defenceMode ?? "Block";
    if (spec.defenceMode === "Resist" && spec.resistedAttribute) {
      details.resistedAttribute = spec.resistedAttribute;
    }
  }
  if (spec.intention === "AUGMENT" || spec.intention === "DEBUFF") {
    details.statTarget = spec.statTarget ?? "ATTACK";
  }
  if (spec.intention === "HEALING") {
    details.healingMode = spec.healingMode ?? "PHYSICAL";
  }
  if (spec.intention === "MOVEMENT") {
    details.movementMode = spec.movementMode ?? "Run";
  }
  if (spec.intention === "CONTROL") {
    details.controlMode = spec.controlMode ?? "Force no main action";
    if (spec.controlTheme) details.controlTheme = spec.controlTheme;
  }
  if (spec.intention === "CLEANSE") {
    details.cleanseEffectType = spec.cleanseEffectType ?? "Active Power";
  }
  return details;
}

function buildPower(spec: PowerSpec, sortOrder: number): CharacterPower {
  const packet = {
    ...createDefaultCharacterPowerPacket(spec.intention, 0),
    id: `${spec.id}:packet-1`,
    diceCount: spec.diceCount,
    potency: spec.potency,
    effectDurationType: spec.durationType ?? "INSTANT",
    effectDurationTurns: spec.durationType === "TURNS" ? spec.durationTurns ?? 1 : null,
    woundChannel:
      spec.intention === "ATTACK" || spec.intention === "HEALING" || spec.intention === "DEFENCE"
        ? spec.attackMode ?? spec.healingMode ?? "PHYSICAL"
        : null,
    targetedAttribute: spec.statTarget ?? null,
    applyTo: spec.applyTo ?? (spec.rangeCategory === "SELF" ? "SELF" : "PRIMARY_TARGET"),
    detailsJson: packetDetails(spec),
  };
  const power = {
    ...createDefaultCharacterPower(sortOrder),
    id: spec.id,
    sortOrder,
    name: spec.name,
    description: spec.description,
    diceCount: spec.diceCount,
    potency: spec.potency,
    effectDurationType: spec.durationType ?? "INSTANT",
    effectDurationTurns: spec.durationType === "TURNS" ? spec.durationTurns ?? 1 : null,
    durationType: spec.durationType ?? "INSTANT",
    durationTurns: spec.durationType === "TURNS" ? spec.durationTurns ?? 1 : null,
    effectPackets: [packet],
    intentions: [packet],
  };
  return normalizeCharacterPower(power, sortOrder);
}

function loadTraitCatalog(rows: Array<{
  id: string;
  name: string;
  descriptor: string;
  classification: "POSITIVE" | "NEGATIVE";
  pointValue: number;
  isActive: boolean;
}>): PlayerTraitDefinition[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    descriptor: row.descriptor,
    classification: row.classification,
    pointValue: row.pointValue,
    isActive: row.isActive,
  }));
}

function updateNarrativeNotes(existing: string, characterName: string) {
  const body = existing
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("BALANCE_STATUS:"))
    .filter((line) => !line.startsWith("BALANCE_SOURCE:"))
    .filter((line) => !line.startsWith("BALANCE_ROLE:"))
    .filter((line) => !line.startsWith("BALANCE_PHASE:"))
    .filter((line) => !line.startsWith("BALANCE_NOTES:"))
    .join("\n")
    .trim();
  return `${balanceMetadata(characterName)}${body ? `\n\n${body}` : ""}`;
}

function validateCharacterKit(params: {
  characterName: string;
  level: number;
  builderData: CharacterBuilderData;
  traitCatalog: PlayerTraitDefinition[];
  powerTuning: PowerTuningSnapshot;
  playerPowerSpendScalar: number;
}) {
  return [
    ...validateBuilderData(params.builderData, params.level, params.traitCatalog),
    ...validateCharacterPowers({
      level: params.level,
      powers: params.builderData.powers,
      tuningSnapshot: params.powerTuning,
      playerPowerSpendScalar: params.playerPowerSpendScalar,
    }),
    ...validateCharacterPowers({
      level: params.level,
      powers: params.builderData.signatureMove ? [params.builderData.signatureMove] : [],
      tuningSnapshot: params.powerTuning,
      playerPowerSpendScalar: params.playerPowerSpendScalar,
      powerPool: signatureMovePointPool(params.level),
      powerLabel: "Signature Move",
      poolDescription: "Character Level x 20",
    }),
  ].map((error) => `${params.characterName}: ${error}`);
}

function entriesToRecord(entries: Array<{ configKey: string; value: number }>): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.configKey, entry.value]));
}

function toPowerTuningSnapshot(set: {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: Date;
  entries: Array<{ configKey: string; value: number }>;
}): PowerTuningSnapshot {
  return {
    setId: set.id,
    name: set.name,
    slug: set.slug,
    status: set.status === "DRAFT" || set.status === "ARCHIVED" ? set.status : "ACTIVE",
    updatedAt: set.updatedAt.toISOString(),
    values: normalizePowerTuningValues(entriesToRecord(set.entries)),
  };
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
    if (!campaign) throw new Error(`Campaign ${BALANCE_CAMPAIGN_ID} was not found.`);
    if (campaign.name !== BALANCE_CAMPAIGN_NAME) {
      throw new Error(`Campaign name mismatch: expected ${BALANCE_CAMPAIGN_NAME}, found ${campaign.name}.`);
    }

    const [traitRows, activePowerTuning, characterBuilderTuning] = await Promise.all([
      prisma.playerTrait.findMany({
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
      }),
      prisma.powerTuningConfigSet.findFirst({
        where: { status: "ACTIVE" },
        orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
        include: { entries: { orderBy: [{ sortOrder: "asc" }, { configKey: "asc" }] } },
      }),
      prisma.characterBuilderTuning.findUnique({
        where: { id: "default" },
        select: { playerPowerSpendScalar: true },
      }),
    ]);
    const traitCatalog = loadTraitCatalog(traitRows);
    const powerTuning = activePowerTuning
      ? toPowerTuningSnapshot(activePowerTuning)
      : {
          setId: "script-default",
          name: "Script default power tuning",
          slug: "script-default-power-tuning",
          status: "ACTIVE" as const,
          updatedAt: new Date(0).toISOString(),
          values: DEFAULT_POWER_TUNING_VALUES,
        };
    const playerPowerSpendScalar = normalizeCharacterPowerSpendScalar(
      characterBuilderTuning?.playerPowerSpendScalar ?? DEFAULT_CHARACTER_POWER_SPEND_SCALAR,
    );

    const outputs: Array<{
      id: string;
      name: string;
      level: number;
      powerPool: number;
      totalSpent: number;
      remaining: number;
      fallbackBasicAttack: boolean;
      hydrationWarnings: string[];
      powers: Array<{
        name: string;
        intention: string;
        spend: number | null;
        basePowerValue: number | null;
        derivedCooldownTurns: number | null;
      }>;
    }> = [];

    for (const kit of CHARACTER_KITS) {
      const rows = await prisma.campaignCharacter.findMany({
        where: { campaignId: BALANCE_CAMPAIGN_ID, name: kit.name },
        select: {
          id: true,
          campaignId: true,
          name: true,
          level: true,
          builderData: true,
          archivedAt: true,
        },
      });
      if (rows.length !== 1) {
        throw new Error(`Expected exactly one ${kit.name} in ${BALANCE_CAMPAIGN_NAME}, found ${rows.length}.`);
      }
      const row = rows[0];
      if (row.level !== LEVEL) {
        throw new Error(`${kit.name} is level ${row.level}; expected ${LEVEL}.`);
      }

      const builderData = sanitizeBuilderEquipment(
        cleanBuilderTraits(normalizeBuilderData(row.builderData), traitCatalog),
        [],
      );
      const powers = kit.powers.map((spec, index) => buildPower(spec, index));
      const nextBuilderData: CharacterBuilderData = {
        ...builderData,
        narrativeNotes: updateNarrativeNotes(builderData.narrativeNotes, kit.name),
        powers,
        signatureMove: null,
        equippedSlots: {},
      };
      const validationErrors = validateCharacterKit({
        characterName: kit.name,
        level: row.level,
        builderData: nextBuilderData,
        traitCatalog,
        powerTuning,
        playerPowerSpendScalar,
      });
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join("\n"));
      }

      const summary = summarizeCharacterPowers({
        level: row.level,
        powers,
        tuningSnapshot: powerTuning,
        playerPowerSpendScalar,
      });
      if (summary.overspent) {
        throw new Error(`${kit.name}: power spend ${summary.totalSpent} exceeds pool ${summary.powerPool}.`);
      }

      const updated = await prisma.campaignCharacter.update({
        where: { id: row.id },
        data: {
          builderData: JSON.parse(JSON.stringify(nextBuilderData)),
          description: updateNarrativeNotes("", kit.name),
          archivedAt: null,
          archivedByUserId: null,
          archiveReason: null,
        },
        select: {
          id: true,
          name: true,
          level: true,
          builderData: true,
        },
      });

      const hydration = adaptCampaignCharacterToCombatActor(
        { ...updated, backpackItems: [] },
        undefined,
        powerTuning,
      );
      const fallbackBasicAttack = hydration.actor.actions.some((action) =>
        action.id.includes("fallback-basic-attack"),
      );
      if (fallbackBasicAttack) {
        throw new Error(`${kit.name}: Combat Lab still produced fallback basic attack after power kit hydration.`);
      }

      outputs.push({
        id: updated.id,
        name: updated.name,
        level: updated.level,
        powerPool: summary.powerPool,
        totalSpent: summary.totalSpent,
        remaining: summary.remaining,
        fallbackBasicAttack,
        hydrationWarnings: hydration.warnings.map((warning) => warning.message),
        powers: summary.powers.map((entry) => ({
          name: entry.power.name,
          intention: entry.power.effectPackets[0]?.intention ?? "UNKNOWN",
          spend: entry.spend,
          basePowerValue: entry.basePowerValue,
          derivedCooldownTurns: entry.derivedCooldownTurns,
        })),
      });
    }

    const finalRows = await prisma.campaignCharacter.findMany({
      where: {
        campaignId: BALANCE_CAMPAIGN_ID,
        name: { in: CHARACTER_KITS.map((kit) => kit.name) },
      },
      select: {
        id: true,
        name: true,
        level: true,
        archivedAt: true,
        builderData: true,
      },
      orderBy: { name: "asc" },
    });
    if (finalRows.length !== CHARACTER_KITS.length) {
      throw new Error(`Expected ${CHARACTER_KITS.length} power-kit characters, found ${finalRows.length}.`);
    }
    for (const row of finalRows) {
      if (row.archivedAt) throw new Error(`${row.name} is archived after update.`);
      const builderData = sanitizeBuilderEquipment(
        cleanBuilderTraits(normalizeBuilderData(row.builderData), traitCatalog),
        [],
      );
      const validationErrors = validateCharacterKit({
        characterName: row.name,
        level: row.level,
        builderData,
        traitCatalog,
        powerTuning,
        playerPowerSpendScalar,
      });
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join("\n"));
      }
      const hydration = adaptCampaignCharacterToCombatActor(
        { ...row, backpackItems: [] },
        undefined,
        powerTuning,
      );
      if (hydration.actor.actions.some((action) => action.id.includes("fallback-basic-attack"))) {
        throw new Error(`${row.name}: focused verification found fallback basic attack.`);
      }
    }

    const finalCounts = await Promise.all([
      prisma.campaignCharacter.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      prisma.monster.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
      prisma.itemTemplate.count({ where: { campaignId: BALANCE_CAMPAIGN_ID } }),
    ]);
    if (finalCounts[1] !== initialCounts[1]) {
      throw new Error(`Monster count changed from ${initialCounts[1]} to ${finalCounts[1]}.`);
    }
    if (finalCounts[2] !== initialCounts[2]) {
      throw new Error(`ItemTemplate count changed from ${initialCounts[2]} to ${finalCounts[2]}.`);
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
      signatureMovesCreated: false,
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
