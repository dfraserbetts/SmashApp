import { POWER_TUNING_CONFIG_KEY_ORDER } from "@/lib/config/powerTuningShared";

export const POWER_TUNING_ADMIN_GROUPS = [
  "Shared Context",
  "Structural",
  "Access",
  "Packet Identity",
  "Packet Magnitude",
  "Packet Timing",
  "Packet Duration",
  "Packet Recipient",
  "Specific Mechanics",
  "Multi-Packet Complexity & Interaction",
  "Axis Expression, Pressure & Repeat Rate",
] as const;

export type PowerTuningAdminGroup = (typeof POWER_TUNING_ADMIN_GROUPS)[number];
export type PowerTuningAffects = "cost" | "axis" | "cost_and_axis";
export type PowerTuningValueFormat = "number" | "multiplier" | "share";

export type PowerTuningAdminMetadata = {
  label: string;
  group: PowerTuningAdminGroup;
  description: string;
  affects: PowerTuningAffects;
  sortOrder?: number;
  format?: PowerTuningValueFormat;
  suggestedMin?: number;
  suggestedMax?: number;
  aliases?: string[];
};

const SEGMENT_LABELS: Record<string, string> = {
  access: "Access",
  activePower: "Active Power",
  addPacket2: "Second Packet",
  addPacket3: "Third Packet",
  addPacket4plus: "Fourth Packet and Beyond",
  allies: "Allies",
  aoe: "AoE",
  aoeCastRange: "AoE Cast Range",
  aoeCount: "AoE Count",
  aoeShape: "AoE Shape",
  armThenTarget: "Arm, Then Target",
  armorSkill: "Armor Skill",
  attachedHostileEntry: "Attached Hostile Entry",
  attachedPressure: "Attached Pressure",
  buildPower: "Build Power",
  buildPowerBonusDice: "Build Power Charged Dice",
  carrierRecurring: "Recurring Carrier Interaction",
  channelledPower: "Channelled Power",
  chargeTurns: "Charge Turns",
  chargeType: "Charge Type",
  coneLength: "Cone Length",
  damageOverTime: "Damage Over Time",
  damageTypeCount: "Damage Type Count",
  delayedCast: "Delayed Release",
  effectOverTime: "Effect Over Time",
  endOfTurn: "End of Turn",
  endOfTurnWhileChannelled: "End of Turn While Channelled",
  fieldPressure: "Field Pressure",
  forceFly: "Force Fly",
  forceMove: "Force Move",
  forceNoMainAction: "Force No Main Action",
  forceNoMove: "Force No Move",
  forcePush: "Force Push",
  forceSpecificMainAction: "Force Specific Main Action",
  forceSpecificPowerAction: "Force Specific Power Action",
  forceTeleport: "Force Teleport",
  hostileToBeneficial: "Hostile Hit into Beneficial Rider",
  latchToPayload: "Attach-then-Payload Interaction",
  lineLength: "Line Length",
  lineWidth: "Line Width",
  meleeTargets: "Melee Targets",
  onAttach: "On Attach",
  onCast: "On Cast",
  onExpiry: "On Expiry",
  onPayload: "On Payload",
  onRelease: "On Release",
  onTrigger: "On Trigger",
  overlapLeverage: "Area Overlap Leverage",
  packet2: "Second Packet",
  packet3plus: "Third Packet and Beyond",
  packetCount: "Packet Count",
  passive: "Passive",
  primaryTargets: "Primary Targets",
  rangeCategory: "Range Category",
  rangedDistance: "Ranged Distance",
  rangedTargets: "Ranged Targets",
  recurringCarrierTurnShare: "Repeat Value per Active Turn",
  recurringTurnTiming: "Repeat Timing Pressure per Turn",
  reservePressure: "Reserve Pressure",
  resultScalingFollowThrough: "Result-Scaling Follow-Through",
  secondaryContingency: "Secondary Packet Contingency",
  sphereRadius: "Sphere Radius",
  startOfTurn: "Start of Turn",
  startOfTurnWhileChannelled: "Start of Turn While Channelled",
  targetThenArm: "Target, Then Arm",
  triggerMethod: "Trigger Setup Method",
  triggerPressure: "Trigger Pressure",
  untilNextTurn: "Until Next Turn",
};

function formatSegment(segment: string): string {
  if (/^\d+$/.test(segment)) return segment;
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function pluralizeTurn(value: string): string {
  return value === "1" ? "1 Turn" : `${value} Turns`;
}

function labelForKey(configKey: string): string {
  const parts = configKey.split(".");
  const [section, family, detail, value] = parts;

  if (section === "shared") {
    if (family === "rangeCategory") return `${formatSegment(detail ?? "")} Range Category Cost`;
    if (family === "meleeTargets") return `Melee Target Count - ${detail}`;
    if (family === "rangedDistance") return `Ranged Distance - ${detail} ft`;
    if (family === "rangedTargets") return `Ranged Target Count - ${detail}`;
    if (family === "aoeCastRange") return `AoE Cast Range - ${detail} ft`;
    if (family === "aoeCount") return `AoE Instance Count - ${detail}`;
    if (family === "aoeShape") return `AoE Shape - ${formatSegment(detail ?? "")}`;
    if (family === "sphereRadius") return `Sphere Radius - ${detail} ft`;
    if (family === "coneLength") return `Cone Length - ${detail} ft`;
    if (family === "lineWidth") return `Line Width - ${detail} ft`;
    if (family === "lineLength") return `Line Length - ${detail} ft`;
  }

  if (section === "structural") {
    if (family === "chassis") return `${formatSegment(detail ?? "")} Chassis Cost`;
    if (family === "lifespan") return `${formatSegment(detail ?? "")} Structure Duration Cost`;
    if (family === "lifespanTurns") return `Structure Duration - ${pluralizeTurn(detail ?? "")}`;
    if (family === "triggerMethod") return `${formatSegment(detail ?? "")} Trigger Setup Cost`;
    if (family === "attachedHostileEntry") return `Attached Hostile Entry - ${formatSegment(detail ?? "")}`;
  }

  if (section === "access") {
    if (family === "chargeTurns") return `Charge Time - ${pluralizeTurn(detail ?? "")}`;
    if (family === "chargeType") return `${formatSegment(detail ?? "")} Charge Cost`;
    if (family === "commitment") return `${formatSegment(detail ?? "")} Commitment Cost`;
    if (family === "counter") return `Counterplay ${formatSegment(detail ?? "")}`;
  }

  if (section === "packet") {
    if (family === "identity") return `${formatSegment(value ?? detail ?? "")} Packet Identity Cost`;
    if (family === "magnitude" && detail === "dice") return `Output Dice - ${value} Dice`;
    if (family === "magnitude" && detail === "potency") return `Potency Rank - ${value}`;
    if (family === "magnitude" && detail === "damageTypeCount") {
      return `Damage Type Multiplier - ${value} Type${value === "1" ? "" : "s"}`;
    }
    if (family === "magnitude" && detail === "buildPowerBonusDice") {
      return `Build Power Charged Dice Multiplier - ${value} Dice`;
    }
    if (family === "magnitude" && detail === "movementTypeMultiplier") {
      return `Movement Magnitude Multiplier - ${formatSegment(value ?? "")}`;
    }
    if (family === "duration") return `${formatSegment(detail ?? "")} Effect Duration Cost`;
    if (family === "durationTurns") return `Effect Duration - ${pluralizeTurn(detail ?? "")}`;
    if (family === "recipient") return `${formatSegment(detail ?? "")} Recipient Cost`;
    if (family === "timing") return `${formatSegment(detail ?? "")} Timing Cost`;
    if (family === "augmentStat") return `Augment Stat - ${formatSegment(detail ?? "")}`;
    if (family === "debuffStat") return `Debuff Stat - ${formatSegment(detail ?? "")}`;
    if (family === "cleanseEffect") return `Cleanse Target - ${formatSegment(detail ?? "")}`;
    if (family === "controlMode") return `Control Mode - ${formatSegment(detail ?? "")}`;
    if (family === "movementType") return `Movement Mode - ${formatSegment(detail ?? "")}`;
    return `${formatSegment(family ?? "")} - ${formatSegment(detail ?? "")}`.trim();
  }

  if (section === "system") {
    if (family === "packetCount") return `${formatSegment(detail ?? "")} Complexity Cost`;
    if (family === "secondaryContingency") return `${formatSegment(detail ?? "")} Contingency Share`;
    if (family === "synergy") return formatSegment(detail ?? "");
  }

  if (section === "axis") {
    if (family === "presence" && detail === "passive") return "Passive Pressure Spill";
    if (family === "presence" && detail === "turns") return "Turn-Based Pressure Spill";
    if (family === "presence" && detail === "recurringTurnTiming") return "Repeat Timing Pressure per Turn";
    if (family === "structural" && detail === "recurringCarrierTurnShare") return "Repeat Value per Active Turn";
    if (family === "structural") return formatSegment(detail ?? "");
  }

  const [, ...rest] = parts;
  return rest.map(formatSegment).join(" / ");
}

function groupForKey(configKey: string): PowerTuningAdminGroup {
  if (configKey.startsWith("shared.")) return "Shared Context";
  if (configKey.startsWith("structural.")) return "Structural";
  if (configKey.startsWith("access.")) return "Access";
  if (configKey.startsWith("packet.identity.")) return "Packet Identity";
  if (configKey.startsWith("packet.magnitude.")) return "Packet Magnitude";
  if (configKey.startsWith("packet.timing.")) return "Packet Timing";
  if (configKey.startsWith("packet.duration")) return "Packet Duration";
  if (configKey.startsWith("packet.recipient.")) return "Packet Recipient";
  if (
    configKey.startsWith("packet.augmentStat.") ||
    configKey.startsWith("packet.cleanseEffect.") ||
    configKey.startsWith("packet.controlMode.") ||
    configKey.startsWith("packet.debuffStat.") ||
    configKey.startsWith("packet.movementType.")
  ) {
    return "Specific Mechanics";
  }
  if (configKey.startsWith("system.")) return "Multi-Packet Complexity & Interaction";
  return "Axis Expression, Pressure & Repeat Rate";
}

function affectsForKey(configKey: string): PowerTuningAffects {
  if (configKey.startsWith("axis.")) return "axis";
  return "cost";
}

function formatForKey(configKey: string): PowerTuningValueFormat {
  if (
    configKey.startsWith("system.secondaryContingency.") ||
    configKey.endsWith("recurringCarrierTurnShare")
  ) {
    return "share";
  }
  if (
    configKey.startsWith("packet.magnitude.damageTypeCount.") ||
    configKey.startsWith("packet.magnitude.buildPowerBonusDice.") ||
    configKey.startsWith("packet.magnitude.movementTypeMultiplier.")
  ) {
    return "multiplier";
  }
  return "number";
}

function descriptionForKey(configKey: string): string {
  if (configKey.startsWith("shared.rangeCategory.")) return "Raises or lowers the shared cost of choosing this range style.";
  if (configKey.startsWith("shared.")) return "Raises or lowers the additive cost from range, target count, or area shape.";
  if (configKey.startsWith("structural.chassis.")) return "Raises or lowers the base cost of this power structure.";
  if (configKey.startsWith("structural.lifespan.")) return "Raises or lowers the base cost for how the structure persists.";
  if (configKey.startsWith("structural.lifespanTurns.")) return "Raises or lowers the extra cost for each authored structure duration.";
  if (configKey.startsWith("structural.triggerMethod.")) return "Raises or lowers the cost of the selected Trigger setup flow.";
  if (configKey.startsWith("structural.attachedHostileEntry.")) return "Raises or lowers the cost of whether an Attached hostile event happens on attach or later payload.";
  if (configKey.startsWith("access.chargeTurns.")) return "Raises or lowers the extra cost for longer charge times.";
  if (configKey.startsWith("access.")) return "Raises or lowers the cost of commitment, counterplay, and charge access.";
  if (configKey.startsWith("packet.identity.")) return "Raises or lowers the base cost of this packet intention.";
  if (configKey.startsWith("packet.magnitude.damageTypeCount.")) return "Multiplies the wound-sensitive part of attack output when more damage types are present.";
  if (configKey.startsWith("packet.magnitude.buildPowerBonusDice.")) return "Multiplies the bonus-output portion created by Build Power charged dice.";
  if (configKey.startsWith("packet.magnitude.movementTypeMultiplier.")) return "Multiplies the generic packet magnitude burden for this movement mode before movement still routes to mobility through the normal packet path.";
  if (configKey.startsWith("packet.magnitude.")) return "Raises or lowers cost from authored dice, potency, or output scale.";
  if (configKey.startsWith("packet.timing.")) return "Raises or lowers cost based on when the packet resolves.";
  if (configKey.startsWith("packet.duration")) return "Raises or lowers cost based on how long the packet effect lasts.";
  if (configKey.startsWith("packet.recipient.")) return "Raises or lowers the packet cost for who receives the effect.";
  if (configKey.startsWith("packet.")) return "Raises or lowers cost for this specific packet mechanic.";
  if (configKey.startsWith("system.packetCount.")) return "Raises or lowers scalar cost from adding more packets; this is cost-only.";
  if (configKey.startsWith("system.secondaryContingency.")) return "Sets how much contingent secondary packets count after the primary packet.";
  if (configKey.startsWith("system.synergy.")) return "Raises or lowers scalar cost for a specific cross-packet interaction.";
  if (configKey.startsWith("axis.presence.")) return "Raises or lowers pressure-axis expression from persistence and repeat timing.";
  if (configKey.startsWith("axis.structural.")) return "Raises or lowers axis expression from persistent structures and recurring carriers.";
  return "Power tuning value.";
}

function aliasesForKey(configKey: string): string[] {
  const aliases = new Set<string>([configKey, ...configKey.split("."), groupForKey(configKey)]);
  const lowerKey = configKey.toLowerCase();

  if (lowerKey.includes("aoe")) {
    aliases.add("AoE");
    aliases.add("Area");
  }
  if (lowerKey.includes("presence")) {
    aliases.add("Pressure");
    aliases.add("Presence");
  }
  if (lowerKey.includes("control") || lowerKey.includes("manipulation")) {
    aliases.add("Control Pressure");
    aliases.add("Manipulation");
  }
  if (lowerKey.includes("buildpower")) {
    aliases.add("Build Power");
    aliases.add("Charged Dice");
  }
  if (lowerKey.includes("delayedcast") || lowerKey.includes("delayedrelease")) {
    aliases.add("Delayed Cast");
    aliases.add("Delayed Release");
  }
  if (lowerKey.includes("lifespan")) {
    aliases.add("Lifespan");
    aliases.add("Structure Duration");
  }
  if (lowerKey.includes("recurring") || lowerKey.includes("carrier")) {
    aliases.add("Cadence");
    aliases.add("Repeat Rate");
    aliases.add("Recurring Carrier");
  }
  if (lowerKey.includes("packetcount")) {
    aliases.add("Packet Count Complexity");
    aliases.add("Multi-Packet");
  }
  if (lowerKey.includes("secondarycontingency")) aliases.add("Contingency");
  if (lowerKey.includes("synergy")) aliases.add("Cross-Packet");
  if (lowerKey.includes("structural")) aliases.add("Structural Presence");
  if (lowerKey.includes("commitment")) aliases.add("Access");

  return Array.from(aliases);
}

function suggestedBoundsForFormat(format: PowerTuningValueFormat): {
  suggestedMin?: number;
  suggestedMax?: number;
} {
  if (format === "share") return { suggestedMin: 0, suggestedMax: 1 };
  if (format === "multiplier") return { suggestedMin: 0, suggestedMax: 3 };
  return { suggestedMin: 0 };
}

function buildMetadata(configKey: string, index: number): PowerTuningAdminMetadata {
  const format = formatForKey(configKey);
  return {
    label: labelForKey(configKey),
    group: groupForKey(configKey),
    description: descriptionForKey(configKey),
    affects: affectsForKey(configKey),
    sortOrder: index,
    format,
    aliases: aliasesForKey(configKey),
    ...suggestedBoundsForFormat(format),
  };
}

export const POWER_TUNING_ADMIN_METADATA: Record<string, PowerTuningAdminMetadata> =
  Object.fromEntries(
    POWER_TUNING_CONFIG_KEY_ORDER.map((configKey, index) => [
      configKey,
      buildMetadata(configKey, index),
    ]),
  );
