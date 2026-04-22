import type {
  EffectDurationType,
  EffectPacket,
  Power,
  PowerIntention,
} from "@/lib/summoning/types";
import type { RadarAxes } from "@/lib/calculators/monsterOutcomeCalculator";
import {
  DEFAULT_POWER_TUNING_VALUES,
  getPowerTuningValue,
  normalizePowerTuningValues,
} from "@/lib/config/powerTuningShared";

export type PowerCostAxisVector = RadarAxes;

export type PowerCostPacketBreakdown = {
  packetIndex: number;
  intention: PowerIntention;
  specific: string | null;
  packetIdentityCost: number;
  packetMagnitudeCost: number;
  packetTimingCost: number;
  packetDurationCost: number;
  packetRecipientCost: number;
  packetSpecificCost: number;
  packetTotalBeforeContingency: number;
  contingencyMultiplier: number;
  packetTotalAfterContingency: number;
  axisVector: PowerCostAxisVector;
  debug: Record<string, unknown>;
};

export type PowerCostBreakdown = {
  tuningSetId: string | null;
  tuningSetName: string | null;
  sharedContextCost: number;
  structuralCost: number;
  accessCost: number;
  packetCosts: PowerCostPacketBreakdown[];
  packetCountComplexityCost: number;
  crossPacketSynergyCost: number;
  basePowerValue: number;
  axisVector: PowerCostAxisVector;
  debug: Record<string, unknown>;
};

type PowerTuningSnapshotLike = {
  setId?: string | null;
  name?: string | null;
  values?: Record<string, number> | null;
};

type CanonicalRangeCategory = "self" | "melee" | "ranged" | "aoe";
type DerivedHostileEntryPattern = "ON_ATTACH" | "ON_PAYLOAD" | null;
type ThreatAxisKey = "physicalThreat" | "mentalThreat";
type SurvivabilityAxisKey = "physicalSurvivability" | "mentalSurvivability";

type SelectedTuningValue = {
  tuningKey: string | null;
  value: number;
  note?: string;
};

const EMPTY_AXIS_VECTOR: PowerCostAxisVector = {
  physicalThreat: 0,
  mentalThreat: 0,
  physicalSurvivability: 0,
  mentalSurvivability: 0,
  manipulation: 0,
  synergy: 0,
  mobility: 0,
  presence: 0,
};

const AXIS_KEYS: Array<keyof PowerCostAxisVector> = [
  "physicalThreat",
  "mentalThreat",
  "physicalSurvivability",
  "mentalSurvivability",
  "manipulation",
  "synergy",
  "mobility",
  "presence",
];

const HOSTILE_FORCED_MOVEMENT_MANIPULATION_SHARE = 0.6;
const HOSTILE_FORCED_MOVEMENT_MOBILITY_SHARE = 0.4;
const ALLIES_SYNERGY_PRIMARY_SHARE = 0.7;
const ALLIES_SELF_SPILL_SHARE = 0.3;

const HOSTILE_INTENTIONS = new Set<PowerIntention>([
  "ATTACK",
  "CONTROL",
  "DEBUFF",
  "MOVEMENT",
]);

const RECURRING_TIMINGS = new Set<NonNullable<EffectPacket["effectTimingType"]>>([
  "START_OF_TURN",
  "END_OF_TURN",
  "START_OF_TURN_WHILST_CHANNELLED",
  "END_OF_TURN_WHILST_CHANNELLED",
]);

function cloneEmptyAxisVector(): PowerCostAxisVector {
  return { ...EMPTY_AXIS_VECTOR };
}

function roundCost(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function addAxisVectors(
  left: PowerCostAxisVector,
  right: Partial<PowerCostAxisVector>,
): PowerCostAxisVector {
  return {
    physicalThreat: left.physicalThreat + (right.physicalThreat ?? 0),
    mentalThreat: left.mentalThreat + (right.mentalThreat ?? 0),
    physicalSurvivability:
      left.physicalSurvivability + (right.physicalSurvivability ?? 0),
    mentalSurvivability: left.mentalSurvivability + (right.mentalSurvivability ?? 0),
    manipulation: left.manipulation + (right.manipulation ?? 0),
    synergy: left.synergy + (right.synergy ?? 0),
    mobility: left.mobility + (right.mobility ?? 0),
    presence: left.presence + (right.presence ?? 0),
  };
}

function normalizeAxisVector(axis: PowerCostAxisVector): PowerCostAxisVector {
  return {
    physicalThreat: roundCost(axis.physicalThreat),
    mentalThreat: roundCost(axis.mentalThreat),
    physicalSurvivability: roundCost(axis.physicalSurvivability),
    mentalSurvivability: roundCost(axis.mentalSurvivability),
    manipulation: roundCost(axis.manipulation),
    synergy: roundCost(axis.synergy),
    mobility: roundCost(axis.mobility),
    presence: roundCost(axis.presence),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asInt(value: unknown, fallback = 0): number {
  const parsed = asNumber(value);
  return parsed === null ? fallback : Math.trunc(parsed);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeMovementMode(value: unknown): string {
  const movementMode = asString(value);
  if (movementMode === "Force Push") return "Force Push";
  if (movementMode === "Force Fly") return "Force Fly";
  if (movementMode === "Force Teleport") return "Force Teleport";
  if (movementMode === "Run") return "Run";
  if (movementMode === "Fly") return "Fly";
  if (movementMode === "Teleport") return "Teleport";
  return movementMode;
}

function isForcedMovementMode(movementMode: string): boolean {
  return (
    movementMode === "Force Push" ||
    movementMode === "Force Fly" ||
    movementMode === "Force Teleport"
  );
}

function isFriendlyMovementMode(movementMode: string): boolean {
  return movementMode === "Run" || movementMode === "Fly" || movementMode === "Teleport";
}

function getEffectPackets(power: Power): EffectPacket[] {
  const rawPackets =
    Array.isArray(power.effectPackets) && power.effectPackets.length > 0
      ? power.effectPackets
      : Array.isArray(power.intentions)
        ? power.intentions
        : [];

  return rawPackets.map((packet, index) => ({
    ...packet,
    sortOrder: packet.sortOrder ?? index,
    packetIndex: packet.packetIndex ?? packet.sortOrder ?? index,
    intention: packet.intention ?? packet.type ?? "ATTACK",
    type: packet.type ?? packet.intention ?? "ATTACK",
    detailsJson: asRecord(packet.detailsJson),
  }));
}

function isHostilePacket(packet: EffectPacket | undefined): boolean {
  if (!packet) return false;
  if (packet.hostility === "HOSTILE") return true;
  if (packet.hostility === "NON_HOSTILE") return false;
  return HOSTILE_INTENTIONS.has(packet.intention ?? packet.type ?? "ATTACK");
}

function resolveCanonicalRangeCategory(power: Power): CanonicalRangeCategory {
  const rangeCategories = Array.isArray(power.rangeCategories) ? power.rangeCategories : [];
  if (rangeCategories.includes("AOE")) return "aoe";
  if (rangeCategories.includes("RANGED")) return "ranged";
  if (rangeCategories.includes("MELEE")) return "melee";
  return "self";
}

function getPowerDurationType(power: Power): EffectDurationType {
  const durationType = asString(power.effectDurationType ?? power.durationType).toUpperCase();
  if (
    durationType === "INSTANT" ||
    durationType === "TURNS" ||
    durationType === "PASSIVE" ||
    durationType === "UNTIL_TARGET_NEXT_TURN"
  ) {
    return durationType;
  }
  return "INSTANT";
}

function getStructuralLifespanType(power: Power): "NONE" | "TURNS" | "PASSIVE" {
  const authoredLifespanType = asString(power.lifespanType).toUpperCase();
  if (
    authoredLifespanType === "NONE" ||
    authoredLifespanType === "TURNS" ||
    authoredLifespanType === "PASSIVE"
  ) {
    return authoredLifespanType;
  }

  const descriptorChassis = asString(power.descriptorChassis).toUpperCase() || "IMMEDIATE";
  if (descriptorChassis !== "IMMEDIATE") {
    return "TURNS";
  }

  const legacyDurationType = getPowerDurationType(power);
  return legacyDurationType === "TURNS" || legacyDurationType === "PASSIVE"
    ? legacyDurationType
    : "NONE";
}

function doesPacketCreateBeyondTurnCarrier(packet: EffectPacket | undefined): boolean {
  if (!packet) return false;
  const durationType = asString(packet.effectDurationType).toUpperCase();
  return (
    durationType === "TURNS" ||
    durationType === "PASSIVE" ||
    durationType === "UNTIL_TARGET_NEXT_TURN"
  );
}

function getPacketApplyTo(packet: EffectPacket): "PRIMARY_TARGET" | "ALLIES" | "SELF" {
  const details = asRecord(packet.detailsJson);
  const value = asString(packet.applyTo ?? details.applyTo).toUpperCase();
  if (value === "ALLIES") return "ALLIES";
  if (value === "SELF") return "SELF";
  return "PRIMARY_TARGET";
}

function getAllowedPacketApplyToOptions(
  canonicalRangeCategory: CanonicalRangeCategory,
  power: Power,
  packet: EffectPacket,
): Array<"PRIMARY_TARGET" | "ALLIES" | "SELF"> {
  if (packet.localTargetingOverride) {
    return ["PRIMARY_TARGET", "ALLIES", "SELF"];
  }
  if (canonicalRangeCategory === "self") {
    return ["SELF"];
  }
  if (canonicalRangeCategory === "melee" && Math.max(1, asInt(power.meleeTargets, 1)) <= 1) {
    return ["PRIMARY_TARGET", "SELF"];
  }
  if (canonicalRangeCategory === "ranged" && Math.max(1, asInt(power.rangedTargets, 1)) <= 1) {
    return ["PRIMARY_TARGET", "SELF"];
  }
  return ["PRIMARY_TARGET", "ALLIES", "SELF"];
}

function countDamageTypes(details: Record<string, unknown>): number {
  if (!Array.isArray(details.damageTypes)) return 0;

  const seen = new Set<string>();
  for (const entry of details.damageTypes) {
    if (typeof entry === "string") {
      const normalized = entry.trim().toLowerCase();
      if (normalized) seen.add(normalized);
      continue;
    }
    if (entry && typeof entry === "object") {
      const normalized = asString((entry as { name?: unknown }).name).toLowerCase();
      if (normalized) seen.add(normalized);
    }
  }
  return seen.size;
}

function getSecondaryScalingMode(details: Record<string, unknown>): string {
  const value = asString(details.secondaryScalingMode).toUpperCase();
  if (value === "PRIMARY_APPLIED_SUCCESSES") return "PRIMARY_APPLIED_SUCCESSES";
  if (value === "PRIMARY_WOUND_BANDS") return "PRIMARY_WOUND_BANDS";
  return "PER_SUCCESS";
}

function normalizeControlMode(value: unknown): string {
  const raw = asString(value);
  if (!raw) return "";
  if (raw === "Force specific action") return "Force specific main action";
  if (raw === "Force no action") return "Force no main action";
  if (raw === "Force specific power") return "Force specific power action";
  return raw;
}

function getStatTargetKey(value: unknown): string | null {
  const normalized = asString(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === "attack") return "attack";
  if (normalized === "guard" || normalized === "defence" || normalized === "defense") return "guard";
  if (normalized === "fortitude") return "fortitude";
  if (normalized === "intellect") return "intellect";
  if (normalized === "synergy" || normalized === "support") return "synergy";
  if (normalized === "bravery") return "bravery";
  if (normalized === "movement") return "movement";
  if (normalized === "weapon skill") return "weaponSkill";
  if (normalized === "armor skill" || normalized === "armour skill") return "armorSkill";
  if (normalized === "dodge") return "dodge";
  if (normalized === "willpower") return "willpower";
  return null;
}

function getPacketThreatAxis(packet: EffectPacket): ThreatAxisKey {
  const details = asRecord(packet.detailsJson);
  const attackMode = asString(details.attackMode).toUpperCase();
  return packet.woundChannel === "MENTAL" || attackMode === "MENTAL"
    ? "mentalThreat"
    : "physicalThreat";
}

function getExplicitPacketThreatAxis(packet: EffectPacket): ThreatAxisKey | null {
  const details = asRecord(packet.detailsJson);
  const attackMode = asString(details.attackMode).toUpperCase();
  if (packet.woundChannel === "MENTAL" || attackMode === "MENTAL") return "mentalThreat";
  if (packet.woundChannel === "PHYSICAL" || attackMode === "PHYSICAL") return "physicalThreat";
  return null;
}

function getRelevantThreatAxes(packets: EffectPacket[]): ThreatAxisKey[] {
  const threatAxes = new Set<ThreatAxisKey>();
  for (const packet of packets) {
    if ((packet.intention ?? packet.type ?? "ATTACK") !== "ATTACK") continue;
    threatAxes.add(getPacketThreatAxis(packet));
  }
  return Array.from(threatAxes);
}

function getPacketRelevantThreatAxes(
  packet: EffectPacket,
  powerRelevantThreatAxes: ThreatAxisKey[],
): ThreatAxisKey[] {
  const threatAxes = new Set<ThreatAxisKey>(powerRelevantThreatAxes);
  const explicitPacketThreatAxis = getExplicitPacketThreatAxis(packet);
  if (explicitPacketThreatAxis) threatAxes.add(explicitPacketThreatAxis);
  return Array.from(threatAxes);
}

function getSurvivabilityAxisFromChannel(value: unknown): SurvivabilityAxisKey {
  return asString(value).toUpperCase() === "MENTAL"
    ? "mentalSurvivability"
    : "physicalSurvivability";
}

function getDefenceStatAxis(statTargetKey: string | null): SurvivabilityAxisKey | null {
  if (
    statTargetKey === "guard" ||
    statTargetKey === "armorSkill" ||
    statTargetKey === "dodge" ||
    statTargetKey === "fortitude"
  ) {
    return "physicalSurvivability";
  }
  if (statTargetKey === "willpower" || statTargetKey === "bravery") {
    return "mentalSurvivability";
  }
  return null;
}

function applyThreatShareToRelevantAxes(
  axisVector: PowerCostAxisVector,
  relevantThreatAxes: ThreatAxisKey[],
  amount: number,
): { appliedAxes: ThreatAxisKey[]; suppressed: boolean } {
  if (amount <= 0 || relevantThreatAxes.length === 0) {
    return { appliedAxes: [], suppressed: amount > 0 };
  }

  const share = amount / relevantThreatAxes.length;
  for (const axisKey of relevantThreatAxes) {
    applyAxisShare(axisVector, axisKey, share);
  }
  return { appliedAxes: relevantThreatAxes, suppressed: false };
}

function resolvePowerTuningValue(
  tuningValues: Record<string, number>,
  tuningKey: string,
): SelectedTuningValue {
  if (Object.prototype.hasOwnProperty.call(tuningValues, tuningKey)) {
    return {
      tuningKey,
      value: roundCost(getPowerTuningValue(tuningValues, tuningKey, 0)),
    };
  }
  return {
    tuningKey: null,
    value: 0,
    note: `Missing tuning key ${tuningKey}`,
  };
}

function resolveDiscreteTuningValue(
  tuningValues: Record<string, number>,
  prefix: string,
  suffix: string | null,
): SelectedTuningValue {
  if (!suffix) {
    return {
      tuningKey: null,
      value: 0,
      note: `No suffix provided for ${prefix}`,
    };
  }
  return resolvePowerTuningValue(tuningValues, `${prefix}.${suffix}`);
}

function resolveNumericTuningValue(
  tuningValues: Record<string, number>,
  prefix: string,
  rawValue: number | null | undefined,
): SelectedTuningValue {
  if (rawValue == null || !Number.isFinite(rawValue)) {
    return {
      tuningKey: null,
      value: 0,
      note: `No numeric value provided for ${prefix}`,
    };
  }

  const exactKey = `${prefix}.${String(Math.trunc(rawValue))}`;
  if (Object.prototype.hasOwnProperty.call(tuningValues, exactKey)) {
    return resolvePowerTuningValue(tuningValues, exactKey);
  }

  const available = Object.keys(tuningValues)
    .filter((key) => key.startsWith(`${prefix}.`))
    .map((key) => {
      const suffix = key.slice(prefix.length + 1);
      const numeric = Number(suffix);
      return Number.isFinite(numeric) ? { key, numeric } : null;
    })
    .filter((entry): entry is { key: string; numeric: number } => Boolean(entry))
    .sort((a, b) => a.numeric - b.numeric);

  const conservative = available.filter((entry) => entry.numeric <= rawValue).pop();
  if (!conservative) {
    return {
      tuningKey: null,
      value: 0,
      note: `No conservative numeric tuning key for ${prefix} using ${rawValue}`,
    };
  }

  return {
    tuningKey: conservative.key,
    value: roundCost(getPowerTuningValue(tuningValues, conservative.key, 0)),
    note: `Used conservative fallback ${conservative.key} for ${prefix}=${rawValue}`,
  };
}

function pushSelectedTuning(
  list: string[],
  notes: string[],
  resolved: SelectedTuningValue,
) {
  if (resolved.tuningKey) list.push(resolved.tuningKey);
  if (resolved.note) notes.push(resolved.note);
}

function applyAxisShare(
  vector: PowerCostAxisVector,
  axisKey: keyof PowerCostAxisVector,
  amount: number,
) {
  vector[axisKey] = roundCost(vector[axisKey] + amount);
}

function scaleAxisVector(
  axisVector: PowerCostAxisVector,
  multiplier: number,
): PowerCostAxisVector {
  const scaled = cloneEmptyAxisVector();
  for (const axisKey of AXIS_KEYS) {
    scaled[axisKey] = roundCost(axisVector[axisKey] * multiplier);
  }
  return scaled;
}

function allocatePacketAxisVector(
  power: Power,
  packet: EffectPacket,
  totalCost: number,
  powerRelevantThreatAxes: ThreatAxisKey[],
): { axisVector: PowerCostAxisVector; debug: Record<string, unknown> } {
  const axisVector = cloneEmptyAxisVector();
  const details = asRecord(packet.detailsJson);
  const intention = packet.intention ?? packet.type ?? "ATTACK";
  const statTargetKey = getStatTargetKey(details.statTarget ?? details.statChoice);
  const movementMode = normalizeMovementMode(details.movementMode);
  const applyTo = getPacketApplyTo(packet);
  const hostile = isHostilePacket(packet);
  const threatAxis = getPacketThreatAxis(packet);
  const relevantThreatAxes = getPacketRelevantThreatAxes(packet, powerRelevantThreatAxes);
  const defenceStatAxis = getDefenceStatAxis(statTargetKey);
  const healingAxis = getSurvivabilityAxisFromChannel(details.healingMode);
  const defenceAxis =
    power.primaryDefenceGate?.protectionChannel != null
      ? getSurvivabilityAxisFromChannel(power.primaryDefenceGate.protectionChannel)
      : getSurvivabilityAxisFromChannel(details.attackMode ?? packet.woundChannel);
  let baseLane: string | null = null;
  const spillRules: string[] = [];
  let augmentRoutingDebug: Record<string, unknown> | null = null;

  switch (intention) {
    case "ATTACK":
      baseLane = threatAxis;
      applyAxisShare(axisVector, threatAxis, totalCost * 0.85);
      applyAxisShare(axisVector, "presence", totalCost * 0.15);
      spillRules.push("presenceFromAttackPressure");
      break;
    case "DEFENCE":
      baseLane = defenceAxis;
      applyAxisShare(axisVector, defenceAxis, totalCost);
      break;
    case "HEALING":
      baseLane = healingAxis;
      applyAxisShare(axisVector, healingAxis, totalCost * 0.7);
      spillRules.push(`healingTo:${healingAxis}`);
      if (applyTo !== "SELF") {
        applyAxisShare(axisVector, "synergy", totalCost * 0.3);
        spillRules.push("healingSynergySpill");
      }
      break;
    case "CLEANSE":
      baseLane = "synergy";
      applyAxisShare(axisVector, "synergy", totalCost);
      break;
    case "CONTROL":
      baseLane = "manipulation";
      applyAxisShare(axisVector, "manipulation", totalCost * 0.85);
      applyAxisShare(axisVector, "presence", totalCost * 0.15);
      spillRules.push("presenceFromControlPressure");
      break;
    case "MOVEMENT":
      {
        const hostileForcedMovement = isForcedMovementMode(movementMode);
        baseLane = hostileForcedMovement ? "manipulationMobilitySplit" : "mobility";
        if (hostileForcedMovement) {
          const manipulationShare = roundCost(
            totalCost * HOSTILE_FORCED_MOVEMENT_MANIPULATION_SHARE,
          );
          const mobilityShare = roundCost(totalCost * HOSTILE_FORCED_MOVEMENT_MOBILITY_SHARE);
          applyAxisShare(axisVector, "manipulation", manipulationShare);
          applyAxisShare(axisVector, "mobility", mobilityShare);
          spillRules.push("hostileForcedMovementToManipulationAndMobility");
        } else {
          applyAxisShare(axisVector, "mobility", totalCost);
          spillRules.push("friendlyMovementToMobility");
        }
        spillRules.push(`movementMode:${movementMode || "unknown"}`);
      }
      break;
    case "AUGMENT": {
      const threatStat = statTargetKey === "attack" || statTargetKey === "weaponSkill";
      const threatSpill = (amount: number) =>
        applyThreatShareToRelevantAxes(axisVector, relevantThreatAxes, amount);
      let augmentPath: "SELF" | "ALLIES" | "PRIMARY_TARGET" = applyTo;
      let secondarySpillLane: keyof PowerCostAxisVector | "threat" | null = null;
      let threatSpillSuppressed = false;
      let threatSpillAxes: ThreatAxisKey[] = [];
      let alliesSplitUsed = false;

      baseLane = applyTo === "SELF" ? "selfUtility" : applyTo === "ALLIES" ? "synergy" : "synergy";
      if (applyTo === "SELF") {
        if (threatStat) {
          const applied = threatSpill(totalCost);
          threatSpillAxes = applied.appliedAxes;
          threatSpillSuppressed = applied.suppressed;
          secondarySpillLane = "threat";
          spillRules.push("selfAugmentAttackClusterToRelevantThreat");
          if (applied.suppressed) spillRules.push("selfAugmentThreatSuppressedNoRelevantThreatLane");
        } else if (defenceStatAxis) {
          applyAxisShare(axisVector, defenceStatAxis, totalCost);
          secondarySpillLane = defenceStatAxis;
          spillRules.push(`selfAugmentDefenceClusterTo:${defenceStatAxis}`);
        } else if (statTargetKey === "intellect") {
          applyAxisShare(axisVector, "manipulation", totalCost);
          secondarySpillLane = "manipulation";
          spillRules.push("selfAugmentIntellectToManipulation");
        } else if (statTargetKey === "synergy") {
          applyAxisShare(axisVector, "synergy", totalCost);
          secondarySpillLane = "synergy";
          spillRules.push("selfAugmentSynergyToSynergy");
        } else if (statTargetKey === "movement") {
          applyAxisShare(axisVector, "mobility", totalCost);
          secondarySpillLane = "mobility";
          spillRules.push("selfAugmentMovementToMobility");
        } else {
          applyAxisShare(axisVector, "physicalSurvivability", totalCost);
          secondarySpillLane = "physicalSurvivability";
          spillRules.push("selfAugmentFallbackToSelfUtility");
        }
      } else if (applyTo === "ALLIES") {
        alliesSplitUsed = true;
        if (statTargetKey === "synergy") {
          applyAxisShare(axisVector, "synergy", totalCost);
          secondarySpillLane = "synergy";
          spillRules.push("alliesAugmentSynergyToSynergy");
        } else {
          applyAxisShare(axisVector, "synergy", totalCost * ALLIES_SYNERGY_PRIMARY_SHARE);
          if (threatStat) {
            const applied = threatSpill(totalCost * ALLIES_SELF_SPILL_SHARE);
            threatSpillAxes = applied.appliedAxes;
            threatSpillSuppressed = applied.suppressed;
            secondarySpillLane = "threat";
            spillRules.push("alliesAugmentAttackClusterSplitToSynergyAndThreat");
            if (applied.suppressed) spillRules.push("alliesAugmentThreatSuppressedNoRelevantThreatLane");
          } else if (defenceStatAxis) {
            applyAxisShare(axisVector, defenceStatAxis, totalCost * ALLIES_SELF_SPILL_SHARE);
            secondarySpillLane = defenceStatAxis;
            spillRules.push(`alliesAugmentDefenceClusterSplitToSynergyAnd:${defenceStatAxis}`);
          } else if (statTargetKey === "intellect") {
            applyAxisShare(axisVector, "manipulation", totalCost * ALLIES_SELF_SPILL_SHARE);
            secondarySpillLane = "manipulation";
            spillRules.push("alliesAugmentIntellectSplitToSynergyAndManipulation");
          } else if (statTargetKey === "movement") {
            applyAxisShare(axisVector, "mobility", totalCost * ALLIES_SELF_SPILL_SHARE);
            secondarySpillLane = "mobility";
            spillRules.push("alliesAugmentMovementSplitToSynergyAndMobility");
          } else {
            applyAxisShare(
              axisVector,
              "physicalSurvivability",
              totalCost * ALLIES_SELF_SPILL_SHARE,
            );
            secondarySpillLane = "physicalSurvivability";
            spillRules.push("alliesAugmentFallbackSplitToSynergyAndSelfUtility");
          }
        }
      } else {
        augmentPath = "PRIMARY_TARGET";
        applyAxisShare(axisVector, "synergy", totalCost * 0.8);
        if (statTargetKey === "movement") {
          applyAxisShare(axisVector, "mobility", totalCost * 0.2);
          spillRules.push("augmentMovementSpillToMobility");
        } else if (defenceStatAxis) {
          applyAxisShare(axisVector, defenceStatAxis, totalCost * 0.2);
          spillRules.push(`augmentDefenceClusterSpillTo:${defenceStatAxis}`);
        } else if (statTargetKey === "attack" || statTargetKey === "weaponSkill") {
          applyAxisShare(axisVector, "physicalThreat", totalCost * 0.2);
          spillRules.push("augmentAttackClusterSpillToPhysicalThreat");
        } else if (statTargetKey === "intellect") {
          applyAxisShare(axisVector, "mentalThreat", totalCost * 0.2);
          spillRules.push("augmentIntellectSpillToMentalThreat");
        } else {
          applyAxisShare(axisVector, "presence", totalCost * 0.2);
          spillRules.push("augmentFallbackSpillToPresence");
        }
      }
      augmentRoutingDebug = {
        recipient: applyTo,
        statTargetKey,
        path: augmentPath,
        selfPathFired: applyTo === "SELF",
        alliesPathFired: applyTo === "ALLIES",
        alliesSplitUsed,
        alliesSynergyPrimaryShare: alliesSplitUsed ? ALLIES_SYNERGY_PRIMARY_SHARE : null,
        alliesSelfSpillShare: alliesSplitUsed ? ALLIES_SELF_SPILL_SHARE : null,
        secondarySpillLane,
        relevantThreatAxes,
        threatSpillAxes,
        threatSpillSuppressed,
      };
      break;
    }
    case "DEBUFF":
      baseLane = "manipulation";
      applyAxisShare(axisVector, "manipulation", totalCost * 0.8);
      if (statTargetKey === "movement") {
        applyAxisShare(axisVector, "mobility", totalCost * 0.2);
        spillRules.push("debuffMovementSpillToMobility");
      } else if (
        hostile &&
        (statTargetKey === "guard" ||
          statTargetKey === "armorSkill" ||
          statTargetKey === "dodge")
      ) {
        applyAxisShare(axisVector, "physicalThreat", totalCost * 0.12);
        applyAxisShare(axisVector, "presence", totalCost * 0.08);
        spillRules.push("hostileDefenceClusterDebuffToThreatAndPresence");
      } else if (
        hostile &&
        (statTargetKey === "attack" || statTargetKey === "weaponSkill")
      ) {
        applyAxisShare(axisVector, "physicalSurvivability", totalCost * 0.2);
        spillRules.push("hostileAttackClusterDebuffTo:physicalSurvivability");
      } else if (defenceStatAxis) {
        applyAxisShare(axisVector, defenceStatAxis, totalCost * 0.2);
        spillRules.push(`debuffDefenceClusterFallbackTo:${defenceStatAxis}`);
      } else if (statTargetKey === "attack" || statTargetKey === "weaponSkill") {
        applyAxisShare(axisVector, "physicalThreat", totalCost * 0.2);
        spillRules.push("debuffAttackClusterFallbackToPhysicalThreat");
      } else if (statTargetKey === "intellect") {
        applyAxisShare(axisVector, "mentalThreat", totalCost * 0.2);
        spillRules.push("debuffIntellectSpillToMentalThreat");
      } else {
        applyAxisShare(axisVector, "presence", totalCost * 0.2);
        spillRules.push("debuffFallbackSpillToPresence");
      }
      break;
    default:
      break;
  }

  return {
    axisVector: normalizeAxisVector(axisVector),
    debug: {
      baseLane,
      applyTo,
      hostile,
      statTargetKey,
      defenceAxis,
      healingAxis,
      defenceStatAxis,
      movementMode: movementMode || null,
      hostileForcedMovementSplitFired:
        intention === "MOVEMENT" ? isForcedMovementMode(movementMode) : false,
      friendlyMovementPathFired:
        intention === "MOVEMENT" ? isFriendlyMovementMode(movementMode) : false,
      fallbackMovementPathFired:
        intention === "MOVEMENT"
          ? !isForcedMovementMode(movementMode) && !isFriendlyMovementMode(movementMode)
          : false,
      movementAxisSplit:
        intention === "MOVEMENT"
          ? {
              manipulation: roundCost(axisVector.manipulation),
              mobility: roundCost(axisVector.mobility),
            }
          : null,
      augmentRouting:
        intention === "AUGMENT" && augmentRoutingDebug
          ? {
              ...augmentRoutingDebug,
              finalPacketAxisContribution: normalizeAxisVector(axisVector),
            }
          : null,
      spillRules,
    },
  };
}

function deriveHostileEntryPattern(
  power: Power,
  packets: EffectPacket[],
): { pattern: DerivedHostileEntryPattern; notes: string[] } {
  const notes: string[] = [];
  const descriptorChassis = asString(power.descriptorChassis).toUpperCase();
  if (descriptorChassis !== "ATTACHED") {
    return { pattern: null, notes };
  }

  const primaryPacket = packets[0];
  if (!isHostilePacket(primaryPacket)) {
    return { pattern: null, notes };
  }

  const explicit = asString(power.primaryDefenceGate?.hostileEntryPattern).toUpperCase();
  if (explicit === "ON_ATTACH" || explicit === "ON_PAYLOAD") {
    return { pattern: explicit, notes };
  }

  const descriptorConfig = asRecord(power.descriptorChassisConfig);
  const primaryTriggerText = asNullableString(primaryPacket?.triggerConditionText);
  const payloadTriggerText = asNullableString(descriptorConfig.payloadTriggerText);
  const primaryTiming = asString(primaryPacket?.effectTimingType).toUpperCase();

  if (primaryTiming === "ON_ATTACH") {
    notes.push("Hostile attached entry inferred from Packet 1 timing ON_ATTACH.");
    return { pattern: "ON_ATTACH", notes };
  }

  if (
    primaryTiming === "ON_TRIGGER" &&
    (primaryTriggerText !== null || payloadTriggerText !== null)
  ) {
    notes.push("Hostile attached entry inferred as ON_PAYLOAD from Packet 1 trigger wording.");
    return { pattern: "ON_PAYLOAD", notes };
  }

  notes.push("Could not confidently infer attached hostile entry timing.");
  return { pattern: null, notes };
}

function getPacketIdentityCost(
  tuningValues: Record<string, number>,
  packet: EffectPacket,
): {
  cost: number;
  tuningKey: string | null;
  deferred: boolean;
  notes: string[];
} {
  const intention = packet.intention ?? packet.type ?? "ATTACK";
  const notes: string[] = [];

  if (intention === "SUMMONING" || intention === "TRANSFORMATION") {
    notes.push("Deferred intention pricing is not implemented yet.");
    return {
      cost: 0,
      tuningKey: null,
      deferred: true,
      notes,
    };
  }

  if (intention === "SUPPORT") {
    notes.push("SUPPORT identity pricing is not configured in Phase 6 defaults yet.");
    return {
      cost: 0,
      tuningKey: null,
      deferred: true,
      notes,
    };
  }

  const resolved = resolveDiscreteTuningValue(
    tuningValues,
    "packet.identity.intention",
    intention.toLowerCase(),
  );
  if (resolved.note) notes.push(resolved.note);

  return {
    cost: resolved.value,
    tuningKey: resolved.tuningKey,
    deferred: false,
    notes,
  };
}

function getPacketMagnitudeCost(
  tuningValues: Record<string, number>,
  power: Power,
  packet: EffectPacket,
): {
  cost: number;
  chosenKeys: string[];
  notes: string[];
  debug: Record<string, unknown>;
} {
  const chosenKeys: string[] = [];
  const notes: string[] = [];
  const details = asRecord(packet.detailsJson);

  const diceResolved = resolveNumericTuningValue(
    tuningValues,
    "packet.magnitude.dice",
    Math.max(1, asInt(packet.diceCount, Math.max(1, asInt(power.diceCount, 1)))),
  );
  const potencyResolved = resolveNumericTuningValue(
    tuningValues,
    "packet.magnitude.potency",
    Math.max(1, asInt(packet.potency, Math.max(1, asInt(power.potency, 1)))),
  );
  pushSelectedTuning(chosenKeys, notes, diceResolved);
  pushSelectedTuning(chosenKeys, notes, potencyResolved);

  const baseMagnitude = diceResolved.value + potencyResolved.value;
  let woundAdjustedMagnitude = baseMagnitude;
  let damageTypeCount = 0;
  let damageTypeMultiplier = 1;
  let damageTypeMultiplierKey: string | null = null;

  if ((packet.intention ?? packet.type ?? "ATTACK") === "ATTACK") {
    damageTypeCount = countDamageTypes(details);
    if (damageTypeCount > 0) {
      const damageTypeResolved = resolveNumericTuningValue(
        tuningValues,
        "packet.magnitude.damageTypeCount",
        damageTypeCount,
      );
      damageTypeMultiplier = damageTypeResolved.value || 1;
      damageTypeMultiplierKey = damageTypeResolved.tuningKey;
      pushSelectedTuning(chosenKeys, notes, damageTypeResolved);
    }
    woundAdjustedMagnitude = baseMagnitude * damageTypeMultiplier;
  }

  let buildPowerBonusCost = 0;
  let buildPowerMultiplier = 1;
  let buildPowerMultiplierKey: string | null = null;
  if (
    (packet.packetIndex ?? 0) === 0 &&
    asString(power.commitmentModifier).toUpperCase() === "CHARGE" &&
    asString(power.chargeType).toUpperCase() === "BUILD_POWER"
  ) {
    const buildPowerResolved = resolveNumericTuningValue(
      tuningValues,
      "packet.magnitude.buildPowerBonusDice",
      Math.max(1, asInt(power.chargeBonusDicePerTurn, 1)),
    );
    buildPowerMultiplier = buildPowerResolved.value || 1;
    buildPowerMultiplierKey = buildPowerResolved.tuningKey;
    buildPowerBonusCost = diceResolved.value * Math.max(0, buildPowerMultiplier - 1);
    pushSelectedTuning(chosenKeys, notes, buildPowerResolved);
  }

  return {
    cost: roundCost(woundAdjustedMagnitude + buildPowerBonusCost),
    chosenKeys,
    notes,
    debug: {
      baseDiceCost: roundCost(diceResolved.value),
      basePotencyCost: roundCost(potencyResolved.value),
      damageTypeCount,
      damageTypeMultiplier: roundCost(damageTypeMultiplier),
      damageTypeMultiplierKey,
      buildPowerMultiplier: roundCost(buildPowerMultiplier),
      buildPowerMultiplierKey,
      buildPowerBonusCost: roundCost(buildPowerBonusCost),
    },
  };
}

function getPacketTimingCost(
  tuningValues: Record<string, number>,
  packet: EffectPacket,
): {
  cost: number;
  tuningKey: string | null;
  notes: string[];
} {
  const notes: string[] = [];
  const timing = asString(packet.effectTimingType).toUpperCase();
  const suffix =
    timing === "ON_CAST"
      ? "onCast"
      : timing === "ON_ATTACH"
        ? "onAttach"
        : timing === "ON_TRIGGER"
          ? "onTrigger"
          : timing === "ON_RELEASE"
            ? "onRelease"
            : timing === "ON_EXPIRY"
              ? "onExpiry"
              : timing === "START_OF_TURN"
                ? "startOfTurn"
                : timing === "END_OF_TURN"
                  ? "endOfTurn"
                  : timing === "START_OF_TURN_WHILST_CHANNELLED"
                    ? "startOfTurnWhileChannelled"
                    : timing === "END_OF_TURN_WHILST_CHANNELLED"
                      ? "endOfTurnWhileChannelled"
                      : null;

  const resolved = resolveDiscreteTuningValue(tuningValues, "packet.timing", suffix);
  if (timing === "ON_HIT") {
    notes.push("ON_HIT timing is outside the current hardened builder timing surface; costed as zero.");
  }
  if (resolved.note) notes.push(resolved.note);

  return {
    cost: resolved.value,
    tuningKey: resolved.tuningKey,
    notes,
  };
}

function getPacketDurationCost(
  tuningValues: Record<string, number>,
  packet: EffectPacket,
): {
  cost: number;
  chosenKeys: string[];
  notes: string[];
} {
  const chosenKeys: string[] = [];
  const notes: string[] = [];
  const durationType = asString(packet.effectDurationType).toUpperCase();
  const durationSuffix =
    durationType === "INSTANT"
      ? "instant"
      : durationType === "PASSIVE"
        ? "passive"
        : durationType === "TURNS"
          ? "turns"
          : durationType === "UNTIL_TARGET_NEXT_TURN"
            ? "untilNextTurn"
            : null;

  const typeResolved = resolveDiscreteTuningValue(
    tuningValues,
    "packet.duration",
    durationSuffix,
  );
  pushSelectedTuning(chosenKeys, notes, typeResolved);

  let turnsCost = 0;
  if (durationType === "TURNS") {
    const turnsResolved = resolveNumericTuningValue(
      tuningValues,
      "packet.durationTurns",
      Math.max(1, asInt(packet.effectDurationTurns, 1)),
    );
    turnsCost = turnsResolved.value;
    pushSelectedTuning(chosenKeys, notes, turnsResolved);
  }

  return {
    cost: roundCost(typeResolved.value + turnsCost),
    chosenKeys,
    notes,
  };
}

function getPacketRecipientCost(
  tuningValues: Record<string, number>,
  canonicalRangeCategory: CanonicalRangeCategory,
  power: Power,
  packet: EffectPacket,
): {
  cost: number;
  tuningKey: string | null;
  notes: string[];
} {
  const notes: string[] = [];
  const applyTo = getPacketApplyTo(packet);
  const suffix =
    applyTo === "SELF"
      ? "self"
      : applyTo === "ALLIES"
        ? "allies"
        : "primaryTargets";
  const resolved = resolveDiscreteTuningValue(
    tuningValues,
    "packet.recipient",
    suffix,
  );

  const allowed = getAllowedPacketApplyToOptions(canonicalRangeCategory, power, packet);
  if (!allowed.includes(applyTo)) {
    notes.push(
      `Packet recipient ${applyTo} is outside the current legality surface for ${canonicalRangeCategory}.`,
    );
  }
  if (resolved.note) notes.push(resolved.note);

  return {
    cost: resolved.value,
    tuningKey: resolved.tuningKey,
    notes,
  };
}

function getPacketSpecificCost(
  tuningValues: Record<string, number>,
  packet: EffectPacket,
): {
  cost: number;
  tuningKey: string | null;
  notes: string[];
} {
  const notes: string[] = [];
  const details = asRecord(packet.detailsJson);
  const intention = packet.intention ?? packet.type ?? "ATTACK";
  let resolved: SelectedTuningValue = { tuningKey: null, value: 0 };

  if (intention === "CONTROL") {
    const controlMode = normalizeControlMode(details.controlMode);
    const suffix =
      controlMode === "Force move"
        ? "forceMove"
        : controlMode === "Force no move"
          ? "forceNoMove"
          : controlMode === "Force no main action"
            ? "forceNoMainAction"
            : controlMode === "Force specific main action"
              ? "forceSpecificMainAction"
              : controlMode === "Force specific power action"
                ? "forceSpecificPowerAction"
                : null;
    resolved = resolveDiscreteTuningValue(tuningValues, "packet.controlMode", suffix);
  } else if (intention === "CLEANSE") {
    const cleanseEffectType = asString(details.cleanseEffectType);
    const suffix =
      cleanseEffectType === "Active Power"
        ? "activePower"
        : cleanseEffectType === "Channelled Power"
          ? "channelledPower"
          : cleanseEffectType === "Damage over time"
            ? "damageOverTime"
            : cleanseEffectType === "Effect over time"
              ? "effectOverTime"
              : null;
    resolved = resolveDiscreteTuningValue(tuningValues, "packet.cleanseEffect", suffix);
  } else if (intention === "MOVEMENT") {
    const movementMode = asString(details.movementMode);
    const suffix =
      movementMode === "Force Push"
        ? "forcePush"
        : movementMode === "Force Teleport"
          ? "forceTeleport"
          : movementMode === "Force Fly"
            ? "forceFly"
            : movementMode === "Run"
              ? "run"
              : movementMode === "Fly"
                ? "fly"
                : movementMode === "Teleport"
                  ? "teleport"
                  : null;
    resolved = resolveDiscreteTuningValue(tuningValues, "packet.movementType", suffix);
  } else if (intention === "AUGMENT" || intention === "DEBUFF") {
    resolved = resolveDiscreteTuningValue(
      tuningValues,
      intention === "AUGMENT" ? "packet.augmentStat" : "packet.debuffStat",
      getStatTargetKey(details.statTarget ?? details.statChoice),
    );
  }

  if (resolved.note) notes.push(resolved.note);
  return {
    cost: resolved.value,
    tuningKey: resolved.tuningKey,
    notes,
  };
}

function getPacketContingencyMultiplier(
  tuningValues: Record<string, number>,
  packetIndex: number,
): SelectedTuningValue {
  if (packetIndex <= 0) return { tuningKey: null, value: 1 };
  if (packetIndex === 1) {
    return resolvePowerTuningValue(tuningValues, "system.secondaryContingency.packet2");
  }
  return resolvePowerTuningValue(tuningValues, "system.secondaryContingency.packet3plus");
}

function getPacketCountComplexityCost(
  tuningValues: Record<string, number>,
  packetCount: number,
): { cost: number; chosenKeys: string[]; debug: Record<string, unknown> } {
  const chosenKeys: string[] = [];
  const base = resolvePowerTuningValue(tuningValues, "system.packetCount.base");
  if (base.tuningKey) chosenKeys.push(base.tuningKey);

  if (packetCount <= 1) {
    return {
      cost: base.value,
      chosenKeys,
      debug: { packetCount, axisEmitted: "none", costOnly: true },
    };
  }

  const addPacket2 = resolvePowerTuningValue(tuningValues, "system.packetCount.addPacket2");
  if (addPacket2.tuningKey) chosenKeys.push(addPacket2.tuningKey);
  if (packetCount === 2) {
    return {
      cost: roundCost(base.value + addPacket2.value),
      chosenKeys,
      debug: { packetCount, axisEmitted: "none", costOnly: true },
    };
  }

  const addPacket3 = resolvePowerTuningValue(tuningValues, "system.packetCount.addPacket3");
  if (addPacket3.tuningKey) chosenKeys.push(addPacket3.tuningKey);
  if (packetCount === 3) {
    return {
      cost: roundCost(base.value + addPacket2.value + addPacket3.value),
      chosenKeys,
      debug: { packetCount, axisEmitted: "none", costOnly: true },
    };
  }

  const addPacket4Plus = resolvePowerTuningValue(
    tuningValues,
    "system.packetCount.addPacket4plus",
  );
  if (addPacket4Plus.tuningKey) chosenKeys.push(addPacket4Plus.tuningKey);
  return {
    cost: roundCost(base.value + addPacket2.value + addPacket3.value + addPacket4Plus.value),
    chosenKeys,
    debug: { packetCount, axisEmitted: "none", costOnly: true },
  };
}

function getStructuralPresenceAxisSpill(
  tuningValues: Record<string, number>,
  power: Power,
): {
  axisVector: PowerCostAxisVector;
  chosenKeys: string[];
  debug: Record<string, unknown>;
} {
  const axisVector = cloneEmptyAxisVector();
  const chosenKeys: string[] = [];
  const descriptorChassis = asString(power.descriptorChassis).toUpperCase() || "IMMEDIATE";
  const durationType = getStructuralLifespanType(power);
  let turnsPresenceContribution = 0;
  let passivePresenceContribution = 0;
  let structuralPresenceContribution = 0;
  let structuralPresenceKey: string | null = null;

  if (durationType === "TURNS") {
    const turnsPresence = resolvePowerTuningValue(tuningValues, "axis.presence.turns");
    if (turnsPresence.tuningKey) chosenKeys.push(turnsPresence.tuningKey);
    applyAxisShare(axisVector, "presence", turnsPresence.value);
    turnsPresenceContribution = roundCost(turnsPresence.value);
  }
  if (durationType === "PASSIVE") {
    const passivePresence = resolvePowerTuningValue(tuningValues, "axis.presence.passive");
    if (passivePresence.tuningKey) chosenKeys.push(passivePresence.tuningKey);
    applyAxisShare(axisVector, "presence", passivePresence.value);
    passivePresenceContribution = roundCost(passivePresence.value);
  }

  const structuralKey =
    descriptorChassis === "FIELD"
      ? "axis.structural.fieldPressure"
      : descriptorChassis === "ATTACHED"
        ? "axis.structural.attachedPressure"
        : descriptorChassis === "TRIGGER"
          ? "axis.structural.triggerPressure"
          : descriptorChassis === "RESERVE"
            ? "axis.structural.reservePressure"
            : null;

  if (structuralKey) {
    const resolved = resolvePowerTuningValue(tuningValues, structuralKey);
    if (resolved.tuningKey) chosenKeys.push(resolved.tuningKey);
    applyAxisShare(axisVector, "presence", resolved.value);
    structuralPresenceContribution = roundCost(resolved.value);
    structuralPresenceKey = resolved.tuningKey;
  }

  return {
    axisVector: normalizeAxisVector(axisVector),
    chosenKeys,
    debug: {
      durationType,
      turnsPresenceContribution,
      passivePresenceContribution,
      structuralPresenceKey,
      structuralPresenceContribution,
    },
  };
}

function getRecurringCadenceAxisSpill(
  tuningValues: Record<string, number>,
  power: Power,
  packets: EffectPacket[],
  packetCosts: PowerCostPacketBreakdown[],
): {
  axisVector: PowerCostAxisVector;
  chosenKeys: string[];
  packetDebug: Array<Record<string, unknown>>;
  debug: Record<string, unknown>;
} {
  const axisVector = cloneEmptyAxisVector();
  const chosenKeys = new Set<string>();
  const packetDebug: Array<Record<string, unknown>> = [];
  const descriptorChassis = asString(power.descriptorChassis).toUpperCase() || "IMMEDIATE";
  const lifespanType = getStructuralLifespanType(power);
  const lifespanTurns = lifespanType === "TURNS" ? Math.max(1, asInt(power.lifespanTurns, 1)) : null;
  const recurrenceCountModifier =
    lifespanType === "TURNS" ? Math.max(0, (lifespanTurns ?? 1) - 1) : lifespanType === "PASSIVE" ? 1 : 0;
  const structuralCarrierAvailable =
    descriptorChassis !== "IMMEDIATE" && (lifespanType === "TURNS" || lifespanType === "PASSIVE");

  for (const [packetIndex, packet] of packets.entries()) {
    const packetCost = packetCosts[packetIndex];
    const timing = asString(packet.effectTimingType).toUpperCase();
    const hasRecurringTiming = RECURRING_TIMINGS.has(
      timing as NonNullable<EffectPacket["effectTimingType"]>,
    );
    const carrierSources: string[] = [];

    if (structuralCarrierAvailable) {
      carrierSources.push("structuralChassisLifespan");
    }
    if (packets.slice(0, packetIndex + 1).some((entry) => doesPacketCreateBeyondTurnCarrier(entry))) {
      carrierSources.push("packetDurationCarrier");
    }

    const hasRealCarrier = carrierSources.length > 0;
    const canCadenceScale = hasRecurringTiming && hasRealCarrier && recurrenceCountModifier > 0;

    if (!canCadenceScale) {
      packetDebug.push({
        packetIndex,
        timing: timing || null,
        fired: false,
        hasRecurringTiming,
        hasRealCarrier,
        carrierSources,
        lifespanType,
        lifespanTurns,
        recurrenceCountModifier,
      });
      continue;
    }

    const recurringTimingPresence = resolvePowerTuningValue(
      tuningValues,
      "axis.presence.recurringTurnTiming",
    );
    const recurringCarrierShare = resolvePowerTuningValue(
      tuningValues,
      "axis.structural.recurringCarrierTurnShare",
    );

    if (recurringTimingPresence.tuningKey) chosenKeys.add(recurringTimingPresence.tuningKey);
    if (recurringCarrierShare.tuningKey) chosenKeys.add(recurringCarrierShare.tuningKey);

    const presenceContribution = roundCost(
      recurringTimingPresence.value * recurrenceCountModifier,
    );
    const packetAxisShareMultiplier = recurringCarrierShare.value * recurrenceCountModifier;
    const packetAxisShare = scaleAxisVector(packetCost.axisVector, packetAxisShareMultiplier);

    applyAxisShare(axisVector, "presence", presenceContribution);
    Object.assign(axisVector, addAxisVectors(axisVector, packetAxisShare));

    packetDebug.push({
      packetIndex,
      timing,
      fired: true,
      hasRecurringTiming,
      hasRealCarrier,
      carrierSources,
      lifespanType,
      lifespanTurns,
      recurrenceCountModifier,
      tuningKeys: [recurringTimingPresence.tuningKey, recurringCarrierShare.tuningKey].filter(Boolean),
      presenceContribution,
      packetAxisShareMultiplier: roundCost(packetAxisShareMultiplier),
      packetAxisShare,
    });
  }

  return {
    axisVector: normalizeAxisVector(axisVector),
    chosenKeys: Array.from(chosenKeys),
    packetDebug,
    debug: {
      descriptorChassis,
      lifespanType,
      lifespanTurns,
      recurrenceCountModifier,
      packetDebug,
    },
  };
}

function getSharedContextCost(
  tuningValues: Record<string, number>,
  power: Power,
  canonicalRangeCategory: CanonicalRangeCategory,
): {
  cost: number;
  chosenKeys: string[];
  notes: string[];
  debug: Record<string, unknown>;
} {
  const chosenKeys: string[] = [];
  const notes: string[] = [];
  let cost = 0;
  let rangedDistanceDebug: Record<string, unknown> | null = null;
  let aoeCastRangeDebug: Record<string, unknown> | null = null;
  let aoeCountDebug: Record<string, unknown> | null = null;
  let aoeShapeDebug: Record<string, unknown> | null = null;
  let aoeGeometryDebug: Record<string, unknown> | null = null;

  const rangeResolved = resolveDiscreteTuningValue(
    tuningValues,
    "shared.rangeCategory",
    canonicalRangeCategory,
  );
  cost += rangeResolved.value;
  pushSelectedTuning(chosenKeys, notes, rangeResolved);

  if (canonicalRangeCategory === "melee") {
    const meleeResolved = resolveNumericTuningValue(
      tuningValues,
      "shared.meleeTargets",
      Math.max(1, asInt(power.meleeTargets, 1)),
    );
    cost += meleeResolved.value;
    pushSelectedTuning(chosenKeys, notes, meleeResolved);
  }

  if (canonicalRangeCategory === "ranged") {
    const rangedDistance = asInt(power.rangedDistanceFeet, 0);
    const distanceResolved = resolveNumericTuningValue(
      tuningValues,
      "shared.rangedDistance",
      rangedDistance,
    );
    const targetsResolved = resolveNumericTuningValue(
      tuningValues,
      "shared.rangedTargets",
      Math.max(1, asInt(power.rangedTargets, 1)),
    );
    cost += distanceResolved.value + targetsResolved.value;
    pushSelectedTuning(chosenKeys, notes, distanceResolved);
    pushSelectedTuning(chosenKeys, notes, targetsResolved);
    rangedDistanceDebug = {
      rawDistanceFeet: rangedDistance,
      tuningKey: distanceResolved.tuningKey,
      contribution: roundCost(distanceResolved.value),
      note: distanceResolved.note ?? null,
    };
  }

  if (canonicalRangeCategory === "aoe") {
    const aoeCastRange = asInt(power.aoeCenterRangeFeet, 0);
    const castRangeResolved = resolveNumericTuningValue(
      tuningValues,
      "shared.aoeCastRange",
      aoeCastRange,
    );
    const countResolved = resolveNumericTuningValue(
      tuningValues,
      "shared.aoeCount",
      Math.max(1, asInt(power.aoeCount, 1)),
    );
    const shapeResolved = resolveDiscreteTuningValue(
      tuningValues,
      "shared.aoeShape",
      asString(power.aoeShape).toLowerCase() || "sphere",
    );
    cost += castRangeResolved.value + countResolved.value + shapeResolved.value;
    pushSelectedTuning(chosenKeys, notes, castRangeResolved);
    pushSelectedTuning(chosenKeys, notes, countResolved);
    pushSelectedTuning(chosenKeys, notes, shapeResolved);
    aoeCastRangeDebug = {
      rawCastRangeFeet: aoeCastRange,
      tuningKey: castRangeResolved.tuningKey,
      contribution: roundCost(castRangeResolved.value),
      note: castRangeResolved.note ?? null,
    };
    aoeCountDebug = {
      rawCount: Math.max(1, asInt(power.aoeCount, 1)),
      tuningKey: countResolved.tuningKey,
      contribution: roundCost(countResolved.value),
      note: countResolved.note ?? null,
    };
    aoeShapeDebug = {
      rawShape: asString(power.aoeShape).toUpperCase() || "SPHERE",
      tuningKey: shapeResolved.tuningKey,
      contribution: roundCost(shapeResolved.value),
      note: shapeResolved.note ?? null,
    };

    if (asString(power.aoeShape).toUpperCase() === "SPHERE") {
      const sphereResolved = resolveNumericTuningValue(
        tuningValues,
        "shared.sphereRadius",
        asInt(power.aoeSphereRadiusFeet, 0),
      );
      cost += sphereResolved.value;
      pushSelectedTuning(chosenKeys, notes, sphereResolved);
      aoeGeometryDebug = {
        type: "SPHERE",
        rawValue: asInt(power.aoeSphereRadiusFeet, 0),
        tuningKey: sphereResolved.tuningKey,
        contribution: roundCost(sphereResolved.value),
        note: sphereResolved.note ?? null,
      };
    }
    if (asString(power.aoeShape).toUpperCase() === "CONE") {
      const coneResolved = resolveNumericTuningValue(
        tuningValues,
        "shared.coneLength",
        asInt(power.aoeConeLengthFeet, 0),
      );
      cost += coneResolved.value;
      pushSelectedTuning(chosenKeys, notes, coneResolved);
      aoeGeometryDebug = {
        type: "CONE",
        rawValue: asInt(power.aoeConeLengthFeet, 0),
        tuningKey: coneResolved.tuningKey,
        contribution: roundCost(coneResolved.value),
        note: coneResolved.note ?? null,
      };
    }
    if (asString(power.aoeShape).toUpperCase() === "LINE") {
      const lineWidthResolved = resolveNumericTuningValue(
        tuningValues,
        "shared.lineWidth",
        asInt(power.aoeLineWidthFeet, 0),
      );
      const lineLengthResolved = resolveNumericTuningValue(
        tuningValues,
        "shared.lineLength",
        asInt(power.aoeLineLengthFeet, 0),
      );
      cost += lineWidthResolved.value + lineLengthResolved.value;
      pushSelectedTuning(chosenKeys, notes, lineWidthResolved);
      pushSelectedTuning(chosenKeys, notes, lineLengthResolved);
      aoeGeometryDebug = {
        type: "LINE",
        width: {
          rawValue: asInt(power.aoeLineWidthFeet, 0),
          tuningKey: lineWidthResolved.tuningKey,
          contribution: roundCost(lineWidthResolved.value),
          note: lineWidthResolved.note ?? null,
        },
        length: {
          rawValue: asInt(power.aoeLineLengthFeet, 0),
          tuningKey: lineLengthResolved.tuningKey,
          contribution: roundCost(lineLengthResolved.value),
          note: lineLengthResolved.note ?? null,
        },
      };
    }
  }

  return {
    cost: roundCost(cost),
    chosenKeys,
    notes,
    debug: {
      canonicalRangeCategory,
      rangeCategoryKey: rangeResolved.tuningKey,
      rangeCategoryContribution: roundCost(rangeResolved.value),
      rangedDistance: rangedDistanceDebug,
      aoeCastRange: aoeCastRangeDebug,
      aoeCount: aoeCountDebug,
      aoeShape: aoeShapeDebug,
      aoeGeometry: aoeGeometryDebug,
    },
  };
}

function getStructuralCost(
  tuningValues: Record<string, number>,
  power: Power,
  derivedHostileEntryPattern: DerivedHostileEntryPattern,
): {
  cost: number;
  chosenKeys: string[];
  notes: string[];
  debug: Record<string, unknown>;
} {
  const chosenKeys: string[] = [];
  const notes: string[] = [];
  const descriptorChassis = asString(power.descriptorChassis).toUpperCase() || "IMMEDIATE";
  const chassisSuffix =
    descriptorChassis === "FIELD"
      ? "field"
      : descriptorChassis === "ATTACHED"
        ? "attached"
        : descriptorChassis === "TRIGGER"
          ? "trigger"
          : descriptorChassis === "RESERVE"
            ? "reserve"
            : "immediate";

  const chassisResolved = resolveDiscreteTuningValue(
    tuningValues,
    "structural.chassis",
    chassisSuffix,
  );
  let cost = chassisResolved.value;
  pushSelectedTuning(chosenKeys, notes, chassisResolved);

  const lifespanType = getStructuralLifespanType(power);
  const lifespanResolved = resolveDiscreteTuningValue(
    tuningValues,
    "structural.lifespan",
    lifespanType === "PASSIVE"
      ? "passive"
      : lifespanType === "TURNS"
        ? "turns"
        : "none",
  );
  cost += lifespanResolved.value;
  pushSelectedTuning(chosenKeys, notes, lifespanResolved);

  const lifespanTurns = lifespanType === "TURNS" ? Math.max(1, asInt(power.lifespanTurns, 1)) : null;
  let lifespanTurnsResolved: SelectedTuningValue | null = null;

  if (lifespanType === "TURNS") {
    lifespanTurnsResolved = resolveNumericTuningValue(
      tuningValues,
      "structural.lifespanTurns",
      lifespanTurns,
    );
    cost += lifespanTurnsResolved.value;
    pushSelectedTuning(chosenKeys, notes, lifespanTurnsResolved);
  }

  if (descriptorChassis === "TRIGGER") {
    const triggerResolved = resolveDiscreteTuningValue(
      tuningValues,
      "structural.triggerMethod",
      asString(power.triggerMethod).toUpperCase() === "ARM_AND_THEN_TARGET"
        ? "armThenTarget"
        : asString(power.triggerMethod).toUpperCase() === "TARGET_AND_THEN_ARM"
          ? "targetThenArm"
          : null,
    );
    cost += triggerResolved.value;
    pushSelectedTuning(chosenKeys, notes, triggerResolved);
  }

  if (descriptorChassis === "ATTACHED") {
    if (derivedHostileEntryPattern === "ON_ATTACH" || derivedHostileEntryPattern === "ON_PAYLOAD") {
      const entryResolved = resolveDiscreteTuningValue(
        tuningValues,
        "structural.attachedHostileEntry",
        derivedHostileEntryPattern === "ON_ATTACH" ? "onAttach" : "onPayload",
      );
      cost += entryResolved.value;
      pushSelectedTuning(chosenKeys, notes, entryResolved);
    }
  }

  return {
    cost: roundCost(cost),
    chosenKeys,
    notes,
    debug: {
      descriptorChassis,
      chassisKey: chassisResolved.tuningKey,
      chassisContribution: roundCost(chassisResolved.value),
      lifespanType,
      lifespanKey: lifespanResolved.tuningKey,
      lifespanContribution: roundCost(lifespanResolved.value),
      lifespanTurns,
      lifespanTurnsKey: lifespanTurnsResolved?.tuningKey ?? null,
      lifespanTurnsContribution: roundCost(lifespanTurnsResolved?.value ?? 0),
      derivedHostileEntryPattern,
    },
  };
}

function getAccessCost(
  tuningValues: Record<string, number>,
  power: Power,
): { cost: number; chosenKeys: string[]; notes: string[] } {
  const chosenKeys: string[] = [];
  const notes: string[] = [];
  let cost = 0;

  const counterResolved = resolveDiscreteTuningValue(
    tuningValues,
    "access.counter",
    asString(power.counterMode).toUpperCase() === "YES" ? "yes" : "no",
  );
  cost += counterResolved.value;
  pushSelectedTuning(chosenKeys, notes, counterResolved);

  const commitment = asString(power.commitmentModifier).toUpperCase() || "STANDARD";
  const commitmentResolved = resolveDiscreteTuningValue(
    tuningValues,
    "access.commitment",
    commitment === "CHANNEL"
      ? "channel"
      : commitment === "CHARGE"
        ? "charge"
        : "standard",
  );
  cost += commitmentResolved.value;
  pushSelectedTuning(chosenKeys, notes, commitmentResolved);

  if (commitment === "CHARGE") {
    const chargeTypeResolved = resolveDiscreteTuningValue(
      tuningValues,
      "access.chargeType",
      asString(power.chargeType).toUpperCase() === "BUILD_POWER"
        ? "buildPower"
        : asString(power.chargeType).toUpperCase() === "DELAYED_RELEASE"
          ? "delayedCast"
          : null,
    );
    const chargeTurnsResolved = resolveNumericTuningValue(
      tuningValues,
      "access.chargeTurns",
      Math.max(1, asInt(power.chargeTurns, 1)),
    );
    cost += chargeTypeResolved.value + chargeTurnsResolved.value;
    pushSelectedTuning(chosenKeys, notes, chargeTypeResolved);
    pushSelectedTuning(chosenKeys, notes, chargeTurnsResolved);
  }

  return {
    cost: roundCost(cost),
    chosenKeys,
    notes,
  };
}

function isBeneficialComboPacket(packet: EffectPacket | undefined): boolean {
  if (!packet) return false;
  const intention = packet.intention ?? packet.type ?? "ATTACK";
  if (packet.hostility === "NON_HOSTILE") return true;
  return (
    intention === "DEFENCE" ||
    intention === "HEALING" ||
    intention === "CLEANSE" ||
    intention === "AUGMENT"
  );
}

function getComboPacketRoutingDebug(
  packet: EffectPacket | undefined,
): Record<string, unknown> | null {
  if (!packet) return null;
  const details = asRecord(packet.detailsJson);
  return {
    intention: packet.intention ?? packet.type ?? "ATTACK",
    recipient: getPacketApplyTo(packet),
    statTargetKey: getStatTargetKey(details.statTarget ?? details.statChoice),
    effect: asNullableString(
      details.controlMode ??
        details.cleanseEffectType ??
        details.movementMode ??
        details.statTarget ??
        details.statChoice,
    ),
  };
}

function routeComboAxisThroughPacket(
  power: Power,
  packet: EffectPacket,
  amount: number,
  relevantThreatAxes: ThreatAxisKey[],
): { axisVector: PowerCostAxisVector; debug: Record<string, unknown> } {
  const routed = allocatePacketAxisVector(power, packet, amount, relevantThreatAxes);
  return {
    axisVector: routed.axisVector,
    debug: {
      ...getComboPacketRoutingDebug(packet),
      axisContribution: routed.axisVector,
      axisRouting: routed.debug,
    },
  };
}

function getCrossPacketSynergyCost(
  tuningValues: Record<string, number>,
  power: Power,
  packets: EffectPacket[],
  canonicalRangeCategory: CanonicalRangeCategory,
  derivedHostileEntryPattern: DerivedHostileEntryPattern,
  relevantThreatAxes: ThreatAxisKey[],
): {
  cost: number;
  axisVector: PowerCostAxisVector;
  chosenKeys: string[];
  triggers: string[];
  notes: string[];
  debug: Record<string, unknown>;
} {
  const chosenKeys: string[] = [];
  const triggers: string[] = [];
  const notes: string[] = [];
  let cost = 0;
  let axisVector = cloneEmptyAxisVector();
  const primaryPacket = packets[0];
  const laterPackets = packets.slice(1);
  let hostileToBeneficialDebug: Record<string, unknown> | null = null;
  let latchToPayloadDebug: Record<string, unknown> | null = null;
  let carrierRecurringDebug: Record<string, unknown> | null = null;
  let resultScalingDebug: Record<string, unknown> | null = null;
  let overlapLeverageDebug: Record<string, unknown> | null = null;

  const beneficialLaterPacket = laterPackets.find(isBeneficialComboPacket);
  const hasBeneficialLaterPacket = Boolean(beneficialLaterPacket);
  if (isHostilePacket(primaryPacket) && hasBeneficialLaterPacket) {
    const resolved = resolvePowerTuningValue(tuningValues, "system.synergy.hostileToBeneficial");
    cost += resolved.value;
    if (resolved.tuningKey) chosenKeys.push(resolved.tuningKey);
    triggers.push("hostileToBeneficial");
    const recipient = beneficialLaterPacket ? getPacketApplyTo(beneficialLaterPacket) : null;
    let axisContribution = cloneEmptyAxisVector();
    let axisRouting: Record<string, unknown> | null = null;
    let axisNote = "No beneficial secondary packet was available for axis routing.";
    if (beneficialLaterPacket) {
      const routed = routeComboAxisThroughPacket(
        power,
        beneficialLaterPacket,
        resolved.value,
        relevantThreatAxes,
      );
      axisContribution = routed.axisVector;
      axisRouting = routed.debug;
      axisNote =
        recipient === "SELF"
          ? "Synergy suppressed because the beneficial follow-through targets SELF; combo axis follows the self-relevant packet lane."
          : "Combo axis follows the beneficial secondary packet lane.";
      axisVector = addAxisVectors(axisVector, axisContribution);
    }
    hostileToBeneficialDebug = {
      fired: true,
      tuningKey: resolved.tuningKey,
      contribution: roundCost(resolved.value),
      axisContribution,
      beneficialSecondary: getComboPacketRoutingDebug(beneficialLaterPacket),
      beneficialRecipient: recipient,
      synergySuppressedForSelfRecipient: recipient === "SELF",
      axisNote,
      axisRouting,
    };
  } else {
    hostileToBeneficialDebug = {
      fired: false,
      primaryHostile: isHostilePacket(primaryPacket),
      hasBeneficialLaterPacket,
    };
  }

  if (
    asString(power.descriptorChassis).toUpperCase() === "ATTACHED" &&
    derivedHostileEntryPattern === "ON_PAYLOAD"
  ) {
    const resolved = resolvePowerTuningValue(tuningValues, "system.synergy.latchToPayload");
    cost += resolved.value;
    if (resolved.tuningKey) chosenKeys.push(resolved.tuningKey);
    triggers.push("latchToPayload");
    latchToPayloadDebug = {
      fired: true,
      tuningKey: resolved.tuningKey,
      contribution: roundCost(resolved.value),
      axisContribution: cloneEmptyAxisVector(),
      axisNote: "Scalar-only in this pass; no automatic Synergy axis emitted for latch-to-payload structure.",
    };
  } else {
    latchToPayloadDebug = {
      fired: false,
      descriptorChassis: asString(power.descriptorChassis).toUpperCase(),
      derivedHostileEntryPattern,
    };
  }

  const laterRecurringSecondary = laterPackets.some((packet) =>
    RECURRING_TIMINGS.has(
      (asString(packet.effectTimingType).toUpperCase() ||
        "ON_CAST") as NonNullable<EffectPacket["effectTimingType"]>,
    ),
  );
  const createsCarrier =
    doesPacketCreateBeyondTurnCarrier(primaryPacket) ||
    (asString(power.descriptorChassis).toUpperCase() !== "IMMEDIATE" && packets.length > 1);
  if (laterRecurringSecondary && createsCarrier) {
    const resolved = resolvePowerTuningValue(tuningValues, "system.synergy.carrierRecurring");
    cost += resolved.value;
    if (resolved.tuningKey) chosenKeys.push(resolved.tuningKey);
    triggers.push("carrierRecurring");
    carrierRecurringDebug = {
      fired: true,
      tuningKey: resolved.tuningKey,
      contribution: roundCost(resolved.value),
      axisContribution: cloneEmptyAxisVector(),
      laterRecurringSecondary,
      createsCarrier,
      axisNote: "Scalar-only in this pass; recurrence axis is handled by packet routing and recurring cadence spill.",
    };
  } else if (laterRecurringSecondary && !createsCarrier) {
    notes.push("Skipped carrierRecurring premium because no clear beyond-resolution carrier was authored.");
    carrierRecurringDebug = {
      fired: false,
      laterRecurringSecondary,
      createsCarrier,
      note: "No clear beyond-resolution carrier was authored.",
    };
  } else {
    carrierRecurringDebug = {
      fired: false,
      laterRecurringSecondary,
      createsCarrier,
    };
  }

  const resultScalingPackets = laterPackets.filter((packet) => {
    const mode = getSecondaryScalingMode(asRecord(packet.detailsJson));
    return mode === "PRIMARY_APPLIED_SUCCESSES" || mode === "PRIMARY_WOUND_BANDS";
  });
  const hasResultScalingFollowThrough = resultScalingPackets.length > 0;
  if (hasResultScalingFollowThrough) {
    const resolved = resolvePowerTuningValue(
      tuningValues,
      "system.synergy.resultScalingFollowThrough",
    );
    cost += resolved.value;
    if (resolved.tuningKey) chosenKeys.push(resolved.tuningKey);
    triggers.push("resultScalingFollowThrough");
    let axisContribution = cloneEmptyAxisVector();
    const routedPackets = resultScalingPackets.map((packet) => {
      const routed = routeComboAxisThroughPacket(
        power,
        packet,
        resolved.value / Math.max(1, resultScalingPackets.length),
        relevantThreatAxes,
      );
      axisContribution = addAxisVectors(axisContribution, routed.axisVector);
      return routed.debug;
    });
    axisVector = addAxisVectors(axisVector, axisContribution);
    resultScalingDebug = {
      fired: true,
      tuningKey: resolved.tuningKey,
      contribution: roundCost(resolved.value),
      axisContribution: normalizeAxisVector(axisContribution),
      routedPackets,
      axisNote: "Combo axis follows the scaled follow-through packet lane instead of defaulting to Synergy.",
    };
  } else {
    resultScalingDebug = {
      fired: false,
      hasResultScalingFollowThrough,
    };
  }

  if (canonicalRangeCategory === "aoe" && Math.max(1, asInt(power.aoeCount, 1)) > 1) {
    const resolved = resolvePowerTuningValue(tuningValues, "system.synergy.overlapLeverage");
    cost += resolved.value;
    if (resolved.tuningKey) chosenKeys.push(resolved.tuningKey);
    triggers.push("overlapLeverage");
    overlapLeverageDebug = {
      fired: true,
      tuningKey: resolved.tuningKey,
      contribution: roundCost(resolved.value),
      axisContribution: cloneEmptyAxisVector(),
      axisNote: "Scalar-only in this pass; no flat Synergy axis emitted from AoE overlap leverage.",
    };
  } else {
    overlapLeverageDebug = {
      fired: false,
      canonicalRangeCategory,
      aoeCount: Math.max(1, asInt(power.aoeCount, 1)),
    };
  }

  return {
    cost: roundCost(cost),
    axisVector: normalizeAxisVector(axisVector),
    chosenKeys,
    triggers,
    notes,
    debug: {
      hostileToBeneficial: hostileToBeneficialDebug,
      latchToPayload: latchToPayloadDebug,
      carrierRecurring: carrierRecurringDebug,
      resultScalingFollowThrough: resultScalingDebug,
      overlapLeverage: overlapLeverageDebug,
    },
  };
}

export function resolvePowerCost(
  power: Power,
  tuningSnapshot?: PowerTuningSnapshotLike,
): PowerCostBreakdown {
  const tuningValues = normalizePowerTuningValues(
    tuningSnapshot?.values ?? DEFAULT_POWER_TUNING_VALUES,
  );
  const packets = getEffectPackets(power);
  const canonicalRangeCategory = resolveCanonicalRangeCategory(power);
  const relevantThreatAxes = getRelevantThreatAxes(packets);
  const axisVector = cloneEmptyAxisVector();
  const topLevelNotes: string[] = [];

  const shared = getSharedContextCost(tuningValues, power, canonicalRangeCategory);
  const hostileEntry = deriveHostileEntryPattern(power, packets);
  topLevelNotes.push(...hostileEntry.notes);
  const structural = getStructuralCost(tuningValues, power, hostileEntry.pattern);
  const access = getAccessCost(tuningValues, power);

  let packetCostsTotal = 0;
  const packetCosts: PowerCostPacketBreakdown[] = packets.map((packet, packetListIndex) => {
    const packetNotes: string[] = [];
    const chosenKeys: string[] = [];
    const details = asRecord(packet.detailsJson);

    const identity = getPacketIdentityCost(tuningValues, packet);
    if (identity.tuningKey) chosenKeys.push(identity.tuningKey);
    packetNotes.push(...identity.notes);

    const magnitude = getPacketMagnitudeCost(tuningValues, power, packet);
    chosenKeys.push(...magnitude.chosenKeys);
    packetNotes.push(...magnitude.notes);

    const timing = getPacketTimingCost(tuningValues, packet);
    if (timing.tuningKey) chosenKeys.push(timing.tuningKey);
    packetNotes.push(...timing.notes);

    const duration = getPacketDurationCost(tuningValues, packet);
    chosenKeys.push(...duration.chosenKeys);
    packetNotes.push(...duration.notes);

    const recipient = getPacketRecipientCost(
      tuningValues,
      canonicalRangeCategory,
      power,
      packet,
    );
    if (recipient.tuningKey) chosenKeys.push(recipient.tuningKey);
    packetNotes.push(...recipient.notes);

    const specific = getPacketSpecificCost(tuningValues, packet);
    if (specific.tuningKey) chosenKeys.push(specific.tuningKey);
    packetNotes.push(...specific.notes);

    const packetTotalBeforeContingency = roundCost(
      identity.cost +
        magnitude.cost +
        timing.cost +
        duration.cost +
        recipient.cost +
        specific.cost,
    );
    const contingency = getPacketContingencyMultiplier(
      tuningValues,
      packet.packetIndex ?? packetListIndex,
    );
    if (contingency.tuningKey) chosenKeys.push(contingency.tuningKey);
    const packetTotalAfterContingency = roundCost(
      packetTotalBeforeContingency * contingency.value,
    );

    packetCostsTotal += packetTotalAfterContingency;
    const packetAxisRouting = allocatePacketAxisVector(
      power,
      packet,
      packetTotalAfterContingency,
      relevantThreatAxes,
    );

    return {
      packetIndex: packet.packetIndex ?? packetListIndex,
      intention: packet.intention ?? packet.type ?? "ATTACK",
      specific:
        packet.specific ??
        asNullableString(
          details.controlMode ??
            details.cleanseEffectType ??
            details.movementMode ??
            details.statTarget ??
            details.statChoice,
        ),
      packetIdentityCost: roundCost(identity.cost),
      packetMagnitudeCost: roundCost(magnitude.cost),
      packetTimingCost: roundCost(timing.cost),
      packetDurationCost: roundCost(duration.cost),
      packetRecipientCost: roundCost(recipient.cost),
      packetSpecificCost: roundCost(specific.cost),
      packetTotalBeforeContingency,
      contingencyMultiplier: roundCost(contingency.value),
      packetTotalAfterContingency,
      axisVector: packetAxisRouting.axisVector,
      debug: {
        intention: packet.intention ?? packet.type ?? "ATTACK",
        specific: packet.specific ?? null,
        timing: packet.effectTimingType ?? null,
        duration: packet.effectDurationType ?? null,
        applyTo: getPacketApplyTo(packet),
        hostility: isHostilePacket(packet) ? "HOSTILE" : "NON_HOSTILE_OR_UNKNOWN",
        chosenTuningKeys: chosenKeys,
        deferredIntention: identity.deferred,
        localTargetingOverride: packet.localTargetingOverride ?? null,
        axisRouting: packetAxisRouting.debug,
        notes: packetNotes,
        magnitude: magnitude.debug,
      },
    };
  });

  const packetCountComplexity = getPacketCountComplexityCost(tuningValues, packets.length);
  const crossPacketSynergy = getCrossPacketSynergyCost(
    tuningValues,
    power,
    packets,
    canonicalRangeCategory,
    hostileEntry.pattern,
    relevantThreatAxes,
  );
  const structuralPresence = getStructuralPresenceAxisSpill(tuningValues, power);
  const recurringCadence = getRecurringCadenceAxisSpill(
    tuningValues,
    power,
    packets,
    packetCosts,
  );

  packetCosts.forEach((packetCost, index) => {
    packetCost.debug.recurringCadence = recurringCadence.packetDebug[index] ?? null;
  });

  for (const packetCost of packetCosts) {
    Object.assign(axisVector, addAxisVectors(axisVector, packetCost.axisVector));
  }
  Object.assign(axisVector, addAxisVectors(axisVector, structuralPresence.axisVector));
  Object.assign(axisVector, addAxisVectors(axisVector, recurringCadence.axisVector));
  Object.assign(axisVector, addAxisVectors(axisVector, crossPacketSynergy.axisVector));

  const basePowerValue = roundCost(
    shared.cost +
      structural.cost +
      access.cost +
      packetCostsTotal +
      packetCountComplexity.cost +
      crossPacketSynergy.cost,
  );

  return {
    tuningSetId: tuningSnapshot?.setId ?? null,
    tuningSetName: tuningSnapshot?.name ?? null,
    sharedContextCost: roundCost(shared.cost),
    structuralCost: roundCost(structural.cost),
    accessCost: roundCost(access.cost),
    packetCosts,
    packetCountComplexityCost: roundCost(packetCountComplexity.cost),
    crossPacketSynergyCost: roundCost(crossPacketSynergy.cost),
    basePowerValue,
    axisVector: normalizeAxisVector(axisVector),
    debug: {
      resolvedCanonicalRangeCategory: canonicalRangeCategory,
      sharedContextBreakdown: shared.debug,
      structuralBreakdown: structural.debug,
      structuralPresenceBreakdown: structuralPresence.debug,
      recurringCadenceBreakdown: recurringCadence.debug,
      relevantThreatAxes,
      selectedSharedContextKeys: shared.chosenKeys,
      selectedStructuralKeys: [
        ...structural.chosenKeys,
        ...structuralPresence.chosenKeys,
        ...recurringCadence.chosenKeys,
      ],
      selectedAccessKeys: access.chosenKeys,
      packetCountComplexityKeys: packetCountComplexity.chosenKeys,
      packetCountComplexityBreakdown: packetCountComplexity.debug,
      synergyTriggers: crossPacketSynergy.triggers,
      crossPacketSynergyBreakdown: crossPacketSynergy.debug,
      synergySourceBreakdown: {
        packetAxisSynergy: roundCost(
          packetCosts.reduce((sum, packetCost) => sum + packetCost.axisVector.synergy, 0),
        ),
        packetCountComplexityAxisSynergy: 0,
        crossPacketSynergyAxisSynergy: crossPacketSynergy.axisVector.synergy,
        structuralPresenceAxisSynergy: structuralPresence.axisVector.synergy,
        recurringCadenceAxisSynergy: recurringCadence.axisVector.synergy,
      },
      attachedHostileEntryPattern: hostileEntry.pattern,
      notes: [
        ...topLevelNotes,
        ...shared.notes,
        ...structural.notes,
        ...access.notes,
        ...crossPacketSynergy.notes,
      ],
      packets: packetCosts.map((packetCost) => packetCost.debug),
    },
  };
}

export function resolvePowerCosts(
  powers: Power[],
  tuningSnapshot?: PowerTuningSnapshotLike,
): {
  powers: Array<{ powerId?: string; name: string; breakdown: PowerCostBreakdown }>;
  totals: {
    sharedContextCost: number;
    structuralCost: number;
    accessCost: number;
    packetCountComplexityCost: number;
    crossPacketSynergyCost: number;
    basePowerValue: number;
    axisVector: PowerCostAxisVector;
  };
} {
  const resolvedPowers = powers.map((power) => ({
    powerId: power.id,
    name: power.name,
    breakdown: resolvePowerCost(power, tuningSnapshot),
  }));

  const totalsAxisVector = resolvedPowers.reduce(
    (axis, row) => addAxisVectors(axis, row.breakdown.axisVector),
    cloneEmptyAxisVector(),
  );

  return {
    powers: resolvedPowers,
    totals: {
      sharedContextCost: roundCost(
        resolvedPowers.reduce((sum, row) => sum + row.breakdown.sharedContextCost, 0),
      ),
      structuralCost: roundCost(
        resolvedPowers.reduce((sum, row) => sum + row.breakdown.structuralCost, 0),
      ),
      accessCost: roundCost(
        resolvedPowers.reduce((sum, row) => sum + row.breakdown.accessCost, 0),
      ),
      packetCountComplexityCost: roundCost(
        resolvedPowers.reduce((sum, row) => sum + row.breakdown.packetCountComplexityCost, 0),
      ),
      crossPacketSynergyCost: roundCost(
        resolvedPowers.reduce((sum, row) => sum + row.breakdown.crossPacketSynergyCost, 0),
      ),
      basePowerValue: roundCost(
        resolvedPowers.reduce((sum, row) => sum + row.breakdown.basePowerValue, 0),
      ),
      axisVector: normalizeAxisVector(totalsAxisVector),
    },
  };
}
