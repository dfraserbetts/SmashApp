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
import { isSelectableDamageTypeName } from "../lib/damageTypes/selectable";
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
const NORMAL_POWER_MIN_SPEND = 130;
const NORMAL_POWER_MAX_SPEND = 150;
const SIGNATURE_MOVE_MIN_SPEND = 50;
const SIGNATURE_MOVE_MAX_SPEND = 60;

type SelectableDamageType = {
  name: string;
  attackMode: WoundChannel;
};

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
  signatureMove: PowerSpec;
};

type PreparedCharacterUpdate = {
  row: {
    id: string;
    name: string;
    level: number;
    builderData: unknown;
  };
  nextBuilderData: CharacterBuilderData;
  normalSummary: ReturnType<typeof summarizeCharacterPowers>;
  signatureSummary: ReturnType<typeof summarizeCharacterPowers>;
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
      {
        id: "balance-arcane-sage-astral-binding",
        name: "Astral Binding",
        description: "A short hostile control weave for testing clean mental control pressure.",
        intention: "CONTROL",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        durationType: "TURNS",
        durationTurns: 1,
        controlMode: "Force no main action",
        controlTheme: "MIND_COGNITION",
      },
      {
        id: "balance-arcane-sage-warding-cipher",
        name: "Warding Cipher",
        description: "A ranged ally mental Block pool for support-side durability calibration.",
        intention: "DEFENCE",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        applyTo: "ALLIES",
        durationType: "TURNS",
        durationTurns: 2,
        attackMode: "MENTAL",
        defenceMode: "Block",
      },
      {
        id: "balance-arcane-sage-purifying-arc",
        name: "Purifying Arc",
        description: "A small ranged cleanse for status cleanup calibration.",
        intention: "CLEANSE",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        applyTo: "ALLIES",
        cleanseEffectType: "Active Power",
      },
      {
        id: "balance-arcane-sage-mind-lance",
        name: "Mind Lance",
        description: "A focused mental strike that anchors the Sage's personal pressure.",
        intention: "ATTACK",
        diceCount: 2,
        potency: 3,
        rangeCategory: "RANGED",
        rangeValue: 60,
        rangeExtra: { targets: 1 },
        attackMode: "MENTAL",
        damageTypes: ["Psychic"],
      },
    ],
    signatureMove: {
      id: "balance-arcane-sage-signature-sigil-of-still-waters",
      name: "Sigil of Still Waters",
      description: "A role-defining support-control sigil that steadies allies while binding one threat.",
      intention: "CONTROL",
      diceCount: 5,
      potency: 4,
      rangeCategory: "RANGED",
      rangeValue: 60,
      rangeExtra: { targets: 1 },
      durationType: "TURNS",
      durationTurns: 2,
      controlMode: "Force no main action",
      controlTheme: "MIND_COGNITION",
    },
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
        damageTypes: ["Piercing"],
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
        id: "balance-ranger-commander-covering-orders",
        name: "Covering Orders",
        description: "A tactical repositioning call represented as a resolvable ally Dodge pool.",
        intention: "DEFENCE",
        diceCount: 1,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        applyTo: "ALLIES",
        durationType: "TURNS",
        durationTurns: 2,
        attackMode: "PHYSICAL",
        defenceMode: "Dodge",
      },
      {
        id: "balance-ranger-commander-marked-volley",
        name: "Marked Volley",
        description: "A heavier ranged strike for martial pressure calibration.",
        intention: "ATTACK",
        diceCount: 2,
        potency: 3,
        rangeCategory: "RANGED",
        rangeValue: 60,
        rangeExtra: { targets: 1 },
        attackMode: "PHYSICAL",
        damageTypes: ["Piercing"],
      },
      {
        id: "balance-ranger-commander-focus-fire",
        name: "Focus Fire",
        description: "A team Attack augment for Assist-friendly leadership pressure.",
        intention: "AUGMENT",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        applyTo: "ALLIES",
        durationType: "TURNS",
        durationTurns: 2,
        statTarget: "ATTACK",
      },
      {
        id: "balance-ranger-commander-disrupting-shot",
        name: "Disrupting Shot",
        description: "A clean Guard debuff used to test tactical pressure without movement abstraction.",
        intention: "DEBUFF",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 60,
        rangeExtra: { targets: 1 },
        durationType: "TURNS",
        durationTurns: 1,
        statTarget: "GUARD",
      },
      {
        id: "balance-ranger-commander-rallying-tonic",
        name: "Rallying Tonic",
        description: "A small tactical recovery order represented as physical healing.",
        intention: "HEALING",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        applyTo: "ALLIES",
        healingMode: "PHYSICAL",
      },
    ],
    signatureMove: {
      id: "balance-ranger-commander-signature-killbox-command",
      name: "Killbox Command",
      description: "A decisive command shot that sets the squad's focus point.",
      intention: "ATTACK",
      diceCount: 3,
      potency: 4,
      rangeCategory: "RANGED",
      rangeValue: 60,
      rangeExtra: { targets: 1 },
      durationType: "TURNS",
      durationTurns: 1,
      attackMode: "PHYSICAL",
      damageTypes: ["Piercing"],
    },
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
      {
        id: "balance-stoneguard-granite-guard",
        name: "Granite Guard",
        description: "A stronger self Block pool for physical endurance calibration.",
        intention: "DEFENCE",
        diceCount: 3,
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
        id: "balance-stoneguard-bracing-roar",
        name: "Bracing Roar",
        description: "A self Guard augment that represents planted defensive footwork.",
        intention: "AUGMENT",
        diceCount: 2,
        potency: 2,
        rangeCategory: "SELF",
        rangeValue: 0,
        applyTo: "SELF",
        durationType: "TURNS",
        durationTurns: 2,
        statTarget: "GUARD",
      },
      {
        id: "balance-stoneguard-breaker-slam",
        name: "Breaker Slam",
        description: "A heavier melee strike for tank pressure calibration.",
        intention: "ATTACK",
        diceCount: 3,
        potency: 3,
        rangeCategory: "MELEE",
        rangeValue: 1,
        attackMode: "PHYSICAL",
        damageTypes: ["Blunt"],
      },
      {
        id: "balance-stoneguard-steel-breath",
        name: "Steel Breath",
        description: "A sturdier self sustain tool for endurance calibration.",
        intention: "HEALING",
        diceCount: 2,
        potency: 3,
        rangeCategory: "SELF",
        rangeValue: 0,
        applyTo: "SELF",
        healingMode: "PHYSICAL",
      },
      {
        id: "balance-stoneguard-anchor-taunt",
        name: "Anchor Taunt",
        description: "A clean Guard debuff that turns tank presence into simulated pressure.",
        intention: "DEBUFF",
        diceCount: 2,
        potency: 2,
        rangeCategory: "MELEE",
        rangeValue: 1,
        durationType: "TURNS",
        durationTurns: 1,
        statTarget: "GUARD",
      },
    ],
    signatureMove: {
      id: "balance-stoneguard-signature-hold-the-line",
      name: "Hold the Line",
      description: "A defining tank stance that turns the Stoneguard into the line of battle.",
      intention: "DEFENCE",
      diceCount: 5,
      potency: 5,
      rangeCategory: "RANGED",
      rangeValue: 30,
      rangeExtra: { targets: 2 },
      applyTo: "ALLIES",
      durationType: "TURNS",
      durationTurns: 3,
      attackMode: "PHYSICAL",
      defenceMode: "Block",
    },
  },
  {
    name: "BALANCE_Hawkshot Archer",
    powers: [
      {
        id: "balance-hawkshot-archer-pinning-shot",
        name: "Pinning Shot",
        description: "A clean ranged physical strike for precision baseline testing.",
        intention: "ATTACK",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 60,
        rangeExtra: { targets: 1 },
        attackMode: "PHYSICAL",
        damageTypes: ["Piercing"],
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
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 30,
        rangeExtra: { targets: 1 },
        durationType: "TURNS",
        durationTurns: 1,
        statTarget: "GUARD",
      },
      {
        id: "balance-hawkshot-archer-raking-shot",
        name: "Raking Shot",
        description: "A heavier precision shot for ranged pressure calibration.",
        intention: "ATTACK",
        diceCount: 3,
        potency: 3,
        rangeCategory: "RANGED",
        rangeValue: 60,
        rangeExtra: { targets: 1 },
        attackMode: "PHYSICAL",
        damageTypes: ["Piercing"],
      },
      {
        id: "balance-hawkshot-archer-hawk-eye",
        name: "Hawk Eye",
        description: "A self Attack augment for precision setup turns.",
        intention: "AUGMENT",
        diceCount: 2,
        potency: 2,
        rangeCategory: "SELF",
        rangeValue: 0,
        applyTo: "SELF",
        durationType: "TURNS",
        durationTurns: 2,
        statTarget: "ATTACK",
      },
      {
        id: "balance-hawkshot-archer-slip-the-line",
        name: "Slip the Line",
        description: "A stronger Dodge pool that keeps the evasive fantasy mechanically simulated.",
        intention: "DEFENCE",
        diceCount: 2,
        potency: 2,
        rangeCategory: "SELF",
        rangeValue: 0,
        applyTo: "SELF",
        durationType: "TURNS",
        durationTurns: 2,
        attackMode: "PHYSICAL",
        defenceMode: "Dodge",
      },
      {
        id: "balance-hawkshot-archer-bleeder-mark",
        name: "Bleeder Mark",
        description: "A sharper Guard debuff for precision pressure testing.",
        intention: "DEBUFF",
        diceCount: 2,
        potency: 2,
        rangeCategory: "RANGED",
        rangeValue: 60,
        rangeExtra: { targets: 1 },
        durationType: "TURNS",
        durationTurns: 1,
        statTarget: "GUARD",
      },
    ],
    signatureMove: {
      id: "balance-hawkshot-archer-signature-skyline-shot",
      name: "Skyline Shot",
      description: "A high-precision ranged finisher for glass-cannon calibration.",
      intention: "ATTACK",
      diceCount: 3,
      potency: 4,
      rangeCategory: "RANGED",
      rangeValue: 60,
      rangeExtra: { targets: 1 },
      durationType: "TURNS",
      durationTurns: 1,
      attackMode: "PHYSICAL",
      damageTypes: ["Piercing"],
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

function hasPureMovementOnlyPower(powers: CharacterPower[]) {
  return powers.some((power) =>
    power.effectPackets.length > 0 &&
    power.effectPackets.every((packet) => packet.intention === "MOVEMENT")
  );
}

function assertSpendBand(params: {
  characterName: string;
  label: string;
  totalSpent: number;
  min: number;
  max: number;
}) {
  if (params.totalSpent < params.min || params.totalSpent > params.max) {
    throw new Error(
      `${params.characterName}: ${params.label} spend ${params.totalSpent} must be ${params.min}-${params.max}.`,
    );
  }
}

function normalizeDamageTypeAttackMode(value: unknown): WoundChannel {
  return String(value ?? "").toUpperCase() === "MENTAL" ? "MENTAL" : "PHYSICAL";
}

function selectableDamageTypeMap(damageTypes: SelectableDamageType[]) {
  return new Map(
    damageTypes.map((damageType) => [
      damageType.name.trim().toLowerCase(),
      {
        name: damageType.name.trim(),
        attackMode: normalizeDamageTypeAttackMode(damageType.attackMode),
      },
    ]),
  );
}

function assertLegalSpecDamageTypes(params: {
  characterName: string;
  powerName: string;
  source: "normal power" | "Signature Move";
  attackMode: WoundChannel;
  damageTypes: string[];
  selectableDamageTypes: SelectableDamageType[];
}) {
  if (params.damageTypes.length === 0) {
    throw new Error(`${params.characterName}: ${params.source} ${params.powerName} must have at least one damage type.`);
  }
  const legalByName = selectableDamageTypeMap(params.selectableDamageTypes);
  for (const damageType of params.damageTypes) {
    const legal = legalByName.get(damageType.trim().toLowerCase());
    if (!legal) {
      throw new Error(
        `${params.characterName}: ${params.source} ${params.powerName} uses illegal damage type "${damageType}".`,
      );
    }
    if (legal.name !== damageType) {
      throw new Error(
        `${params.characterName}: ${params.source} ${params.powerName} must use canonical damage type "${legal.name}", not "${damageType}".`,
      );
    }
    if (legal.attackMode !== params.attackMode) {
      throw new Error(
        `${params.characterName}: ${params.source} ${params.powerName} uses ${damageType} (${legal.attackMode}) on ${params.attackMode} attack mode.`,
      );
    }
  }
}

function assertKitDamageTypes(params: {
  kit: CharacterKit;
  selectableDamageTypes: SelectableDamageType[];
}) {
  for (const spec of params.kit.powers) {
    if (spec.intention !== "ATTACK") continue;
    assertLegalSpecDamageTypes({
      characterName: params.kit.name,
      powerName: spec.name,
      source: "normal power",
      attackMode: normalizeDamageTypeAttackMode(spec.attackMode),
      damageTypes: spec.damageTypes ?? ["Blunt"],
      selectableDamageTypes: params.selectableDamageTypes,
    });
  }
  if (params.kit.signatureMove.intention === "ATTACK") {
    assertLegalSpecDamageTypes({
      characterName: params.kit.name,
      powerName: params.kit.signatureMove.name,
      source: "Signature Move",
      attackMode: normalizeDamageTypeAttackMode(params.kit.signatureMove.attackMode),
      damageTypes: params.kit.signatureMove.damageTypes ?? ["Blunt"],
      selectableDamageTypes: params.selectableDamageTypes,
    });
  }
}

function assertBuiltPowerDamageTypes(params: {
  characterName: string;
  power: CharacterPower;
  source: "normal power" | "Signature Move";
  selectableDamageTypes: SelectableDamageType[];
}) {
  for (const [packetIndex, packet] of params.power.effectPackets.entries()) {
    if (packet.intention !== "ATTACK") continue;
    const details =
      packet.detailsJson && typeof packet.detailsJson === "object"
        ? packet.detailsJson as Record<string, unknown>
        : {};
    const damageTypes = Array.isArray(details.damageTypes)
      ? details.damageTypes.map((entry) => String(entry)).filter(Boolean)
      : [];
    assertLegalSpecDamageTypes({
      characterName: params.characterName,
      powerName: `${params.power.name} packet ${packetIndex + 1}`,
      source: params.source,
      attackMode: normalizeDamageTypeAttackMode(details.attackMode ?? packet.woundChannel),
      damageTypes,
      selectableDamageTypes: params.selectableDamageTypes,
    });
  }
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

    const [traitRows, activePowerTuning, characterBuilderTuning, damageTypeRows] = await Promise.all([
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
      prisma.damageType.findMany({
        orderBy: { name: "asc" },
        select: { name: true, attackMode: true },
      }),
    ]);
    const selectableDamageTypes = damageTypeRows
      .filter((row) => isSelectableDamageTypeName(row.name))
      .map((row) => ({
        name: row.name,
        attackMode: normalizeDamageTypeAttackMode(row.attackMode),
      }));
    for (const kit of CHARACTER_KITS) {
      assertKitDamageTypes({ kit, selectableDamageTypes });
    }
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
      normalPowerPool: number;
      normalPowerSpent: number;
      normalPowerRemaining: number;
      signatureMovePool: number;
      signatureMoveSpent: number;
      signatureMoveRemaining: number;
      fallbackBasicAttack: boolean;
      hydrationWarnings: string[];
      powers: Array<{
        name: string;
        intention: string;
        spend: number | null;
        basePowerValue: number | null;
        derivedCooldownTurns: number | null;
      }>;
      signatureMove: {
        name: string;
        spend: number | null;
        basePowerValue: number | null;
        derivedCooldownTurns: number | null;
      } | null;
    }> = [];
    const preparedUpdates: PreparedCharacterUpdate[] = [];

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

      const builderData = cleanBuilderTraits(normalizeBuilderData(row.builderData), traitCatalog);
      const powers = kit.powers.map((spec, index) => buildPower(spec, index));
      const signatureMove = buildPower(kit.signatureMove, 0);
      for (const power of powers) {
        assertBuiltPowerDamageTypes({
          characterName: kit.name,
          power,
          source: "normal power",
          selectableDamageTypes,
        });
      }
      assertBuiltPowerDamageTypes({
        characterName: kit.name,
        power: signatureMove,
        source: "Signature Move",
        selectableDamageTypes,
      });
      const nextBuilderData: CharacterBuilderData = {
        ...builderData,
        narrativeNotes: updateNarrativeNotes(builderData.narrativeNotes, kit.name),
        powers,
        signatureMove,
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
      assertSpendBand({
        characterName: kit.name,
        label: "normal Power Point",
        totalSpent: summary.totalSpent,
        min: NORMAL_POWER_MIN_SPEND,
        max: NORMAL_POWER_MAX_SPEND,
      });
      const signatureSummary = summarizeCharacterPowers({
        level: row.level,
        powers: [signatureMove],
        tuningSnapshot: powerTuning,
        playerPowerSpendScalar,
        powerPool: signatureMovePointPool(row.level),
      });
      if (signatureSummary.overspent) {
        throw new Error(`${kit.name}: Signature Move spend ${signatureSummary.totalSpent} exceeds pool ${signatureSummary.powerPool}.`);
      }
      assertSpendBand({
        characterName: kit.name,
        label: "Signature Move",
        totalSpent: signatureSummary.totalSpent,
        min: SIGNATURE_MOVE_MIN_SPEND,
        max: SIGNATURE_MOVE_MAX_SPEND,
      });
      if (hasPureMovementOnlyPower([...powers, signatureMove])) {
        throw new Error(`${kit.name}: pure Movement-only powers are not allowed in Balance Environment calibration kits.`);
      }
      preparedUpdates.push({
        row,
        nextBuilderData,
        normalSummary: summary,
        signatureSummary,
      });
    }

    for (const prepared of preparedUpdates) {
      const updated = await prisma.campaignCharacter.update({
        where: { id: prepared.row.id },
        data: {
          builderData: JSON.parse(JSON.stringify(prepared.nextBuilderData)),
          description: updateNarrativeNotes("", prepared.row.name),
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
        throw new Error(`${prepared.row.name}: Combat Lab still produced fallback basic attack after power kit hydration.`);
      }

      outputs.push({
        id: updated.id,
        name: updated.name,
        level: updated.level,
        normalPowerPool: prepared.normalSummary.powerPool,
        normalPowerSpent: prepared.normalSummary.totalSpent,
        normalPowerRemaining: prepared.normalSummary.remaining,
        signatureMovePool: prepared.signatureSummary.powerPool,
        signatureMoveSpent: prepared.signatureSummary.totalSpent,
        signatureMoveRemaining: prepared.signatureSummary.remaining,
        fallbackBasicAttack,
        hydrationWarnings: hydration.warnings.map((warning) => warning.message),
        powers: prepared.normalSummary.powers.map((entry) => ({
          name: entry.power.name,
          intention: entry.power.effectPackets[0]?.intention ?? "UNKNOWN",
          spend: entry.spend,
          basePowerValue: entry.basePowerValue,
          derivedCooldownTurns: entry.derivedCooldownTurns,
        })),
        signatureMove: prepared.signatureSummary.powers.map((entry) => ({
          name: entry.power.name,
          spend: entry.spend,
          basePowerValue: entry.basePowerValue,
          derivedCooldownTurns: entry.derivedCooldownTurns,
        }))[0] ?? null,
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
      const normalSummary = summarizeCharacterPowers({
        level: row.level,
        powers: builderData.powers,
        tuningSnapshot: powerTuning,
        playerPowerSpendScalar,
      });
      const signatureSummary = summarizeCharacterPowers({
        level: row.level,
        powers: builderData.signatureMove ? [builderData.signatureMove] : [],
        tuningSnapshot: powerTuning,
        playerPowerSpendScalar,
        powerPool: signatureMovePointPool(row.level),
      });
      assertSpendBand({
        characterName: row.name,
        label: "normal Power Point",
        totalSpent: normalSummary.totalSpent,
        min: NORMAL_POWER_MIN_SPEND,
        max: NORMAL_POWER_MAX_SPEND,
      });
      assertSpendBand({
        characterName: row.name,
        label: "Signature Move",
        totalSpent: signatureSummary.totalSpent,
        min: SIGNATURE_MOVE_MIN_SPEND,
        max: SIGNATURE_MOVE_MAX_SPEND,
      });
      if (hasPureMovementOnlyPower([...builderData.powers, ...(builderData.signatureMove ? [builderData.signatureMove] : [])])) {
        throw new Error(`${row.name}: focused verification found a pure Movement-only power.`);
      }
      for (const power of builderData.powers) {
        assertBuiltPowerDamageTypes({
          characterName: row.name,
          power,
          source: "normal power",
          selectableDamageTypes,
        });
      }
      if (builderData.signatureMove) {
        assertBuiltPowerDamageTypes({
          characterName: row.name,
          power: builderData.signatureMove,
          source: "Signature Move",
          selectableDamageTypes,
        });
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
      signatureMovesCreated: true,
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
