"use client";

import { FormEvent, type CSSProperties, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { CampaignNav } from "@/app/components/CampaignNav";
import {
  CHARACTER_SHEET_THEME_LABELS,
  CharacterSheetPreview,
  type CharacterSheetTheme,
} from "@/app/campaign/[id]/characters/[characterId]/components/CharacterSheetPreview";
import { useProtectionTuning } from "@/app/summoning-circle/components/useProtectionTuning";
import {
  CHARACTER_ATTRIBUTES,
  EQUIPMENT_SLOT_GROUPS,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOTS,
  GREAT_SECRET_TEMPLATES,
  HEROIC_ATTRIBUTE_ARRAY,
  LEGAL_ATTRIBUTE_VALUES,
  MAX_CHARACTERISTIC_UNITS,
  characteristicCost,
  characterPoints,
  defaultBuilderData,
  getCanAddAttributeSwapForBudget,
  getCharacteristicUnits,
  getEquipmentSlotUseCounts,
  getLegalMagnitudeOptionsForBudget,
  isBackpackItemLegalForEquipmentSlot,
  normalizeBuilderData,
  renderCharacteristicDescriptor,
  renderGreatSecret,
  resistPointBudget,
  selectedTraitSummary,
  signedTraitPointDisplay,
  totalCharacteristicCost,
  traitPointBudget,
  validateAttributes,
  validateBuilderData,
  validateCharacteristic,
  validateResistPoints,
  type AttributeMethod,
  type CharacterAttribute,
  type CharacterAttributeValue,
  type CharacterBuilderData,
  type CharacteristicEffectFamily,
  type CharacteristicState,
  type EquipmentSlotKey,
  type PlayerTraitDefinition,
} from "@/lib/characterBuilder/core";
import {
  buildCharacterDerivedCombatStats,
  type CharacterBuilderDerivedBackpackItem,
  type CharacterDerivedCombatStats,
} from "@/lib/characterBuilder/derivedStats";
import {
  CHARACTER_POWER_ATTACK_MODES,
  CHARACTER_POWER_ATTRIBUTE_OPTIONS,
  CHARACTER_POWER_CLEANSE_EFFECTS,
  CHARACTER_POWER_CONTROL_MODES,
  CHARACTER_POWER_CONTROL_THEME_OPTIONS,
  CHARACTER_POWER_DEFENCE_MODES,
  CHARACTER_POWER_DEFENCE_RESISTED_ATTRIBUTES,
  CHARACTER_POWER_FALLBACK_DAMAGE_TYPES,
  CHARACTER_POWER_INTENTION_OPTIONS,
  CHARACTER_POWER_MAX_DAMAGE_TYPES,
  CHARACTER_POWER_MAX_DICE_COUNT,
  CHARACTER_POWER_MAX_PACKET_DURATION_TURNS,
  CHARACTER_POWER_MAX_POTENCY,
  CHARACTER_POWER_MOVEMENT_MODES,
  CHARACTER_POWER_RANGE_AOE_CENTER_RANGE_OPTIONS,
  CHARACTER_POWER_RANGE_AOE_CONE_LENGTH_OPTIONS,
  CHARACTER_POWER_RANGE_AOE_LINE_LENGTH_OPTIONS,
  CHARACTER_POWER_RANGE_AOE_LINE_WIDTH_OPTIONS,
  CHARACTER_POWER_RANGE_AOE_SHAPES,
  CHARACTER_POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS,
  CHARACTER_POWER_RANGE_RANGED_DISTANCE_OPTIONS,
  CHARACTER_POWER_RANGE_TARGET_OPTIONS,
  CHARACTER_POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS,
  createDefaultCharacterPower,
  createDefaultCharacterPowerPacket,
  getCharacterPowerAllowedCommitmentOptions,
  getCharacterPowerAllowedCounterOptions,
  getCharacterPowerAllowedApplyToOptions,
  getCharacterPowerAllowedDurationOptions,
  getCharacterPowerAllowedLifespanOptions,
  getCharacterPowerAllowedRangeCategories,
  getCharacterPowerAllowedTimingOptions,
  getCharacterPowerAllowedTriggerConditionOptions,
  getCharacterPowerPrimaryDefenceLabel,
  isCharacterPowerPacketTimingAuthorable,
  isCharacterPowerSecondaryDiceAuthored,
  readCharacterPowerAttachedHostileEntryPattern,
  SECONDARY_DEPENDENCY_MODE_LABELS,
  SECONDARY_DEPENDENCY_MODE_OPTIONS,
  signatureMovePointPool,
  summarizeCharacterPowers,
  validateCharacterPowers,
  type CharacterPower,
} from "@/lib/characterBuilder/powers";
import type { PowerTuningSnapshot } from "@/lib/config/powerTuningShared";
import type { CharacterBuilderTuningSnapshot } from "@/lib/config/characterBuilderTuningShared";
import type { CombatDieSize } from "@/lib/combat-lab/types";
import { getForgeRarityPalette } from "@/lib/forge/itemRarityPalette";
import type { MonsterModifierField } from "@/lib/summoning/equipment";
import type {
  DescriptorChassisType,
  EffectDurationType,
  EffectPacket,
  EffectTimingType,
  EffectPacketApplyTo,
  PowerIntention,
  SecondaryDependencyMode,
  TriggerConditionKey,
} from "@/lib/summoning/types";

type CharacterBuilderRecord = {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string | null;
  age: string | null;
  race: string | null;
  description: string | null;
  level: number;
  builderData: CharacterBuilderData;
  assignedUserId: string | null;
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type BuilderPayload = {
  campaign: {
    id: string;
    name: string;
  };
  character: CharacterBuilderRecord;
  access: {
    userId: string;
    role: string | null;
    permissions: {
      canManageCampaignCharacters: boolean;
    };
  };
  canEdit: boolean;
  assignedPlayerLabel: string;
  traitCatalog: PlayerTraitDefinition[];
  backpackItems: BuilderBackpackItem[];
  transferTargets: BackpackTransferTarget[];
  powerTuning: PowerTuningSnapshot;
  characterBuilderTuning: CharacterBuilderTuningSnapshot;
  error?: string;
};

type BackpackTransferTarget = {
  characterId: string;
  characterName: string;
  assignedPlayerLabel: string;
  label: string;
};

type PowerDamageTypeOption = {
  id: number;
  name: string;
  attackMode: "PHYSICAL" | "MENTAL";
};

type BuilderBackpackItem = {
  id: string;
  campaignId: string;
  characterId: string;
  partyInventoryItemId: string;
  quantity: number;
  itemTemplate: {
    id: string;
    itemUrl: string | null;
    name: string | null;
    rarity: string | null;
    level: number | null;
    type: string | null;
    size: string | null;
    armorLocation: string | null;
    itemLocation: string | null;
    ppv: number | null;
    mpv: number | null;
    globalAttributeModifiers: Array<{ attribute?: string; amount?: number }> | null;
    meleeTargets: number | null;
    rangedTargets: number | null;
    rangedDistanceFeet: number | null;
    aoeCenterRangeFeet: number | null;
    aoeCount: number | null;
    aoeShape: "SPHERE" | "CONE" | "LINE" | null;
    aoeSphereRadiusFeet: number | null;
    aoeConeLengthFeet: number | null;
    aoeLineWidthFeet: number | null;
    aoeLineLengthFeet: number | null;
    physicalStrength: number | null;
    mentalStrength: number | null;
    meleePhysicalStrength: number | null;
    meleeMentalStrength: number | null;
    rangedPhysicalStrength: number | null;
    rangedMentalStrength: number | null;
    aoePhysicalStrength: number | null;
    aoeMentalStrength: number | null;
    meleeDamageTypes: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;
    rangedDamageTypes: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;
    aoeDamageTypes: Array<{ name: string; mode: "PHYSICAL" | "MENTAL" }>;
    attackEffectsMelee: string[];
    attackEffectsRanged: string[];
    attackEffectsAoE: string[];
    generalDescription: string | null;
    details: string;
    descriptorSections: Array<{ title: string; lines: string[] }>;
    descriptorWarnings: string[];
  };
};

type BuilderDraft = {
  name: string;
  imageUrl: string;
  age: string;
  race: string;
  description: string;
  level: string;
  builderData: CharacterBuilderData;
};

const EMPTY_BACKPACK_ITEMS: BuilderBackpackItem[] = [];
const EMPTY_TRANSFER_TARGETS: BackpackTransferTarget[] = [];
const SIGNATURE_MOVE_POWER_INDEX = -1;
const POWER_CHASSIS_OPTIONS: DescriptorChassisType[] = [
  "IMMEDIATE",
  "FIELD",
  "ATTACHED",
  "TRIGGER",
  "RESERVE",
];
const POWER_INTENTION_OPTIONS: PowerIntention[] = [...CHARACTER_POWER_INTENTION_OPTIONS];
const POWER_CHARGE_TYPE_LABELS: Record<NonNullable<CharacterPower["chargeType"]>, string> = {
  DELAYED_RELEASE: "Delayed Cast",
  BUILD_POWER: "Build Power",
};
const POWER_TRIGGER_METHOD_LABELS: Record<NonNullable<CharacterPower["triggerMethod"]>, string> = {
  ARM_AND_THEN_TARGET: "Arm and then target",
  TARGET_AND_THEN_ARM: "Target and then arm",
};
const POWER_TRIGGER_CONDITION_LABELS: Record<TriggerConditionKey, string> = {
  AREA_ENTERS: "Enters the area",
  AREA_LEAVES: "Leaves the area",
  AREA_STARTS_TURN: "Starts turn in the area",
  AREA_ENDS_TURN: "Ends turn in the area",
  MOVES: "Moves",
  MAKES_ATTACK: "Makes an attack",
  ACTIVATES_POWER: "Activates a power",
  SUFFERS_WOUNDS: "Suffers wounds",
  HEALS_WOUNDS: "Heals wounds",
  SUFFERS_EFFECT: "Suffers an effect",
  GAINS_EFFECT: "Gains an effect",
  USES_ITEM: "Uses an item",
  MAKES_DEFENCE_ROLL: "Makes a Defence roll",
  MAKES_RESIST_ROLL: "Makes a Resist roll",
};
const POWER_RESERVE_RELEASE_BEHAVIOUR_LABELS: Record<(typeof CHARACTER_POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS)[number], string> = {
  ACTION_OR_RESPONSE: "Power Action or Response",
  ACTION_ONLY: "Power Action only",
  RESPONSE_ONLY: "Response only",
  ON_EXPIRY: "Release on expiry",
};
const POWER_EFFECT_TIMING_LABELS: Partial<Record<EffectTimingType, string>> = {
  ON_CAST: "On Cast",
  ON_TRIGGER: "On Trigger",
  ON_ATTACH: "On Attach",
  START_OF_TURN: "Start of Turn",
  END_OF_TURN: "End of Turn",
  START_OF_TURN_WHILST_CHANNELLED: "Start of Turn Whilst Channelled",
  END_OF_TURN_WHILST_CHANNELLED: "End of Turn Whilst Channelled",
  ON_RELEASE: "On Release",
  ON_EXPIRY: "On Expiry",
};
const POWER_EFFECT_DURATION_LABELS: Record<EffectDurationType, string> = {
  INSTANT: "Instant",
  UNTIL_TARGET_NEXT_TURN: "Until target's next turn",
  TURNS: "Turns",
  PASSIVE: "Passive",
};
const POWER_ATTACK_MODE_LABELS: Record<(typeof CHARACTER_POWER_ATTACK_MODES)[number], string> = {
  PHYSICAL: "Physical",
  MENTAL: "Mental",
};
const POWER_APPLY_TO_LABELS: Record<EffectPacketApplyTo, string> = {
  PRIMARY_TARGET: "Primary Targets",
  ALLIES: "Allies",
  SELF: "Self",
};
const POWER_ATTACHED_HOST_ANCHOR_LABELS: Record<NonNullable<CharacterPower["attachedHostAnchorType"]>, string> = {
  TARGET: "Target",
  OBJECT: "Object",
  WEAPON: "Weapon",
  ARMOR: "Armor",
  SELF: "Self",
  AREA: "Area",
};
const POWER_ATTACHED_HOST_ANCHOR_TEXT: Record<NonNullable<CharacterPower["attachedHostAnchorType"]>, string> = {
  TARGET: "the target",
  OBJECT: "the object",
  WEAPON: "your weapon",
  ARMOR: "your armor",
  SELF: "self",
  AREA: "the area",
};
type CharacterPowerRangeCategory = "SELF" | "MELEE" | "RANGED" | "AOE";
const ATTRIBUTE_MODIFIER_FIELDS: Record<CharacterAttribute, MonsterModifierField> = {
  Attack: "attackModifier",
  Guard: "guardModifier",
  Fortitude: "fortitudeModifier",
  Intellect: "intellectModifier",
  Synergy: "synergyModifier",
  Bravery: "braveryModifier",
};

function createCharacterPowerRangeDetails(category: CharacterPowerRangeCategory) {
  if (category === "SELF") {
    return { rangeCategory: "SELF", rangeValue: 0, rangeExtra: {} };
  }
  if (category === "MELEE") {
    return { rangeCategory: "MELEE", rangeValue: CHARACTER_POWER_RANGE_TARGET_OPTIONS[0], rangeExtra: {} };
  }
  if (category === "RANGED") {
    return {
      rangeCategory: "RANGED",
      rangeValue: CHARACTER_POWER_RANGE_RANGED_DISTANCE_OPTIONS[0],
      rangeExtra: { targets: CHARACTER_POWER_RANGE_TARGET_OPTIONS[0] },
    };
  }
  return {
    rangeCategory: "AOE",
    rangeValue: CHARACTER_POWER_RANGE_AOE_CENTER_RANGE_OPTIONS[1],
    rangeExtra: {
      count: CHARACTER_POWER_RANGE_TARGET_OPTIONS[0],
      shape: CHARACTER_POWER_RANGE_AOE_SHAPES[0],
      sphereRadiusFeet: CHARACTER_POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS[0],
      coneLengthFeet: CHARACTER_POWER_RANGE_AOE_CONE_LENGTH_OPTIONS[0],
      lineWidthFeet: CHARACTER_POWER_RANGE_AOE_LINE_WIDTH_OPTIONS[0],
      lineLengthFeet: CHARACTER_POWER_RANGE_AOE_LINE_LENGTH_OPTIONS[0],
    },
  };
}

function reconcilePowerRangeForUi(power: CharacterPower): CharacterPower {
  const packets = power.effectPackets.length > 0
    ? [...power.effectPackets]
    : [createDefaultCharacterPowerPacket("ATTACK", 0)];
  const primaryPacket = packets[0];
  const primaryDetails =
    primaryPacket?.detailsJson && typeof primaryPacket.detailsJson === "object"
      ? (primaryPacket.detailsJson as Record<string, unknown>)
      : {};
  const currentRangeCategory = String(primaryDetails.rangeCategory ?? "MELEE").toUpperCase() as CharacterPowerRangeCategory;
  const allowedRangeCategories = getCharacterPowerAllowedRangeCategories({
    descriptorChassis: power.descriptorChassis ?? "IMMEDIATE",
    attachedHostAnchorType: power.attachedHostAnchorType,
  }) as CharacterPowerRangeCategory[];
  const nextRangeCategory = allowedRangeCategories.includes(currentRangeCategory)
    ? currentRangeCategory
    : allowedRangeCategories[0] ?? currentRangeCategory;

  if (primaryPacket && nextRangeCategory !== currentRangeCategory) {
    packets[0] = {
      ...primaryPacket,
      detailsJson: {
        ...primaryDetails,
        ...createCharacterPowerRangeDetails(nextRangeCategory),
      },
    };
  }

  return { ...power, effectPackets: packets, intentions: packets };
}

function reconcilePowerPacketTimingForUi(power: CharacterPower): CharacterPower {
  const rangeReconciledPower = reconcilePowerRangeForUi(power);
  const packets = rangeReconciledPower.effectPackets.length > 0
    ? [...rangeReconciledPower.effectPackets]
    : [createDefaultCharacterPowerPacket("ATTACK", 0)];

  for (let packetIndex = 0; packetIndex < packets.length; packetIndex += 1) {
    const packet = packets[packetIndex];
    const timingProbe = { ...rangeReconciledPower, effectPackets: packets, intentions: packets };
    const timingAuthorable = isCharacterPowerPacketTimingAuthorable(timingProbe, packetIndex);
    const allowedTimings = getCharacterPowerAllowedTimingOptions(timingProbe, packetIndex);
    const currentTiming = packet.effectTimingType ?? "ON_CAST";
    const nextTiming = timingAuthorable && allowedTimings.includes(currentTiming)
      ? currentTiming
      : timingAuthorable
        ? allowedTimings[0] ?? currentTiming
        : currentTiming;
    const allowedDurations = getCharacterPowerAllowedDurationOptions(nextTiming);
    const currentDuration = packet.effectDurationType ?? "INSTANT";
    const nextDuration = allowedDurations.includes(currentDuration)
      ? currentDuration
      : "INSTANT";

    packets[packetIndex] = {
      ...packet,
      sortOrder: packetIndex,
      packetIndex,
      effectTimingType: nextTiming,
      effectTimingTurns: nextTiming === "ON_TRIGGER" ? packet.effectTimingTurns ?? 1 : null,
      effectDurationType: nextDuration,
      effectDurationTurns: nextDuration === "TURNS" ? packet.effectDurationTurns ?? 1 : null,
    };
  }

  return {
    ...rangeReconciledPower,
    effectPackets: packets,
    intentions: packets,
  };
}

function displayName(name: string | null | undefined) {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "UNNAMED";
}

function makeDraft(character: CharacterBuilderRecord): BuilderDraft {
  return {
    name: displayName(character.name) === "UNNAMED" ? "" : character.name,
    imageUrl: character.imageUrl ?? "",
    age: character.age ?? "",
    race: character.race ?? "",
    description: character.description ?? "",
    level: String(character.level || 1),
    builderData: normalizeBuilderData(character.builderData ?? defaultBuilderData()),
  };
}

function normalizeAgeInput(value: string) {
  return value.replace(/\D/g, "");
}

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

function privacySafePlayerLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withoutParentheticalEmail = trimmed.replace(/\s*\([^()\s]+@[^()\s]+\)\s*$/, "").trim();
  if (!withoutParentheticalEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(withoutParentheticalEmail)) {
    return null;
  }
  return withoutParentheticalEmail;
}

function formatBackpackItemMeta(item: BuilderBackpackItem) {
  const template = item.itemTemplate;
  return [
    template.type,
    template.rarity,
    template.level !== null && template.level !== undefined ? `Level ${template.level}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function formatLocationLabel(item: BuilderBackpackItem) {
  const template = item.itemTemplate;
  return template.size ?? template.armorLocation ?? template.itemLocation ?? "Unassigned";
}

function renderForgeStyleLine(line: string, key: string, bodyTextClass: string, attackLabelClass: string) {
  const parts = String(line).split("||");
  const hasHeader = parts.length > 1;
  const header = (hasHeader ? parts[0] : "").trim();
  const text = (hasHeader ? parts.slice(1).join("||") : parts[0]).trim();

  if (!hasHeader) {
    return (
      <p key={key} className={`text-sm leading-5 ${bodyTextClass}`}>
        {text}
      </p>
    );
  }

  return (
    <div key={key} className="grid grid-cols-[72px_1fr] gap-x-2 text-sm leading-5">
      <div className={`font-semibold ${attackLabelClass}`}>{header}</div>
      <div className={bodyTextClass}>{text}</div>
    </div>
  );
}

function BackpackItemPreview({ item }: { item: BuilderBackpackItem }) {
  const template = item.itemTemplate;
  const palette = getForgeRarityPalette(template.rarity);
  const displayName = template.name?.trim() ? template.name : "(Unnamed item)";
  const meta = formatBackpackItemMeta(item);
  const locationLabel = formatLocationLabel(item);
  const safeItemUrl = template.itemUrl?.trim() ?? "";
  const imageSrc = isHttpUrl(safeItemUrl) ? safeItemUrl : "/item-placeholder.png";

  return (
    <article
      className={`rounded-lg border p-1.5 ${palette.outerBorderClass} ${palette.outerShadowClass}`}
      style={{ backgroundImage: palette.backgroundImage }}
    >
      <div
        className={`rounded-md border p-4 ${palette.innerBorderClass} ${palette.innerShadowClass}`}
      >
        <div className={`border-b pb-3 ${palette.dividerBorderClass}`}>
          <div
            className={`font-serif text-xs uppercase tracking-[0.22em] ${palette.headerTextClass}`}
          >
            {template.rarity ?? "COMMON"} {template.type ?? "ITEM"} - {locationLabel}
          </div>
          <div
            className={`mt-1 font-serif text-xl font-semibold uppercase tracking-[0.16em] ${palette.nameTextClass}`}
          >
            {displayName}
          </div>
          {template.generalDescription ? (
            <p className={`mt-2 text-sm ${palette.descriptionTextClass}`}>
              {template.generalDescription}
            </p>
          ) : null}
          {meta ? <p className="mt-2 text-xs text-zinc-300">{meta}</p> : null}
        </div>

        <div
          className={`mt-3 overflow-hidden rounded-lg border ${palette.imageBorderClass} bg-black/35 shadow-[inset_0_0_18px_rgba(0,0,0,0.55)]`}
        >
          <img
            src={imageSrc}
            alt={displayName}
            className="w-full max-h-[520px] bg-black/20 object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = "/item-placeholder.png";
            }}
          />
        </div>

        {template.descriptorSections.length > 0 ? (
          <div className="mt-3 space-y-2">
            {template.descriptorSections.map((section) => (
              <section
                key={section.title}
                className={`rounded-lg border p-3 ${palette.panelBorderClass} bg-black/30 ${palette.panelShadowClass}`}
              >
                <div
                  className={`font-serif text-xs uppercase tracking-[0.18em] ${palette.headerTextClass}`}
                >
                  {section.title}
                </div>
                <div className="mt-2 space-y-1">
                  {section.lines.map((line, index) =>
                    renderForgeStyleLine(
                      line,
                      `${section.title}-${index}`,
                      palette.bodyTextClass,
                      palette.attackLabelClass,
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-zinc-800 bg-black/40 p-3 text-sm text-zinc-300">
            No detailed equipment output is available for this item yet.
          </p>
        )}

        {template.descriptorWarnings.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-200">
            {template.descriptorWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

function stripForgeLineLabel(line: string) {
  const parts = String(line).split("||");
  return (parts.length > 1 ? parts.slice(1).join("||") : parts[0]).trim();
}

function compactModifierAttribute(attribute: string, amount: number) {
  const normalizedAmount = Math.trunc(amount);
  const sign = normalizedAmount > 0 ? `+${normalizedAmount}` : String(normalizedAmount);
  const defenceMatch = attribute.match(/^(?:(dice)\s+)?(?:to\s+)?Defence rolls against (.+?) attacks$/i);
  if (!defenceMatch) return null;
  const damageType = defenceMatch[2].trim();
  return defenceMatch[1] ? `${sign} dice vs ${damageType}` : `${sign} defence vs ${damageType}`;
}

function formatCompactModifier(attribute: string | undefined, amount: number | undefined) {
  if (!attribute || !Number.isFinite(amount)) return null;
  const normalizedAmount = Math.trunc(amount ?? 0);
  if (normalizedAmount === 0) return null;
  const compactAttribute = compactModifierAttribute(attribute, normalizedAmount);
  if (compactAttribute) return compactAttribute;
  return `${normalizedAmount > 0 ? "+" : ""}${normalizedAmount} ${attribute}`;
}

function normalizeSignedInput(value: string) {
  return value.replace(/[−–—]/g, "-").trim();
}

function formatCompactSignedValue(value: string) {
  const numeric = Math.trunc(Number(normalizeSignedInput(value)));
  if (!Number.isFinite(numeric)) return value;
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

function compactEquippedItemLine(line: string) {
  const cleaned = stripForgeLineLabel(line);
  const withoutPeriod = cleaned.replace(/\.$/, "").trim();

  const customMatch = withoutPeriod.match(/^Custom:\s*(.+)$/i);
  if (customMatch) return customMatch[1].trim();

  const vrpMatch = withoutPeriod.match(
    /^Whilst (?:wearing this armor|wielding this shield), you (gain|suffer) ([+\-−]?\d+)( dice)? to Defence rolls against ([A-Za-z ]+) attacks$/i,
  );
  if (vrpMatch) {
    const amountNumber = Math.abs(Math.trunc(Number(normalizeSignedInput(vrpMatch[2]))));
    const signedAmount = vrpMatch[1].toLowerCase() === "suffer" ? `-${amountNumber}` : `+${amountNumber}`;
    const damageType = vrpMatch[4].trim();
    return vrpMatch[3] ? `${signedAmount} dice vs ${damageType}` : `${signedAmount} defence vs ${damageType}`;
  }

  const rawVrpMatch = withoutPeriod.match(
    /^([+\-−]?\d+)( dice)? (?:to )?Defence rolls against ([A-Za-z ]+) attacks$/i,
  );
  if (rawVrpMatch) {
    const amount = formatCompactSignedValue(rawVrpMatch[1]);
    return rawVrpMatch[2]
      ? `${amount} dice vs ${rawVrpMatch[3].trim()}`
      : `${amount} defence vs ${rawVrpMatch[3].trim()}`;
  }

  const attributeMatch = withoutPeriod.match(
    /^Whilst (?:wielding this shield|wearing this armor|wearing this item), (?:the wielder gains|you gain) ([+\-−]?\d+) to ([A-Za-z ]+)$/i,
  );
  if (attributeMatch) {
    return `${formatCompactSignedValue(attributeMatch[1])} ${attributeMatch[2].trim()}`;
  }

  const spikedMatch = withoutPeriod.match(
    /^Spiked:\s*Whenever you are the target of a melee attack, the attacking creature suffers (\d+) physical piercing wounds?$/i,
  );
  if (spikedMatch) return `Spiked ${spikedMatch[1]}`;

  return cleaned;
}

function formatSignedModifierValue(value: number) {
  const normalized = Math.trunc(value);
  return normalized > 0 ? `+${normalized}` : String(normalized);
}

type DerivedSkillConnection = {
  label: string;
  value: (stats: CharacterDerivedCombatStats) => number;
  color: string;
  sources: CharacterAttribute[];
  targetRow: number;
  trunkX: number;
};

const DERIVED_SKILL_CONNECTIONS: DerivedSkillConnection[] = [
  {
    label: "Weapon Skill",
    value: (stats) => stats.weaponSkill,
    color: "#ef4444",
    sources: ["Bravery", "Attack"],
    targetRow: 0,
    trunkX: 20,
  },
  {
    label: "Armor Skill",
    value: (stats) => stats.armorSkill,
    color: "#3b82f6",
    sources: ["Fortitude", "Guard"],
    targetRow: 5 / 3,
    trunkX: 40,
  },
  {
    label: "Dodge",
    value: (stats) => stats.dodgeValue,
    color: "#22c55e",
    sources: ["Guard", "Intellect"],
    targetRow: 10 / 3,
    trunkX: 60,
  },
  {
    label: "Willpower",
    value: (stats) => stats.willpower,
    color: "#a855f7",
    sources: ["Synergy", "Bravery"],
    targetRow: 5,
    trunkX: 80,
  },
];

const ATTRIBUTE_ROUTE_ROWS: Record<CharacterAttribute, number> = {
  Attack: 0,
  Guard: 1,
  Fortitude: 2,
  Intellect: 3,
  Synergy: 4,
  Bravery: 5,
};

const DERIVED_SKILL_LABEL_X = 58;

function routeTrunkX(skill: DerivedSkillConnection) {
  return (skill.trunkX / 100) * DERIVED_SKILL_LABEL_X;
}

function routeTop(row: number) {
  return `${((row + 0.5) / CHARACTER_ATTRIBUTES.length) * 100}%`;
}

function routeTopPercent(row: number) {
  return ((row + 0.5) / CHARACTER_ATTRIBUTES.length) * 100;
}

function routeLaneOffset(source: CharacterAttribute, skillLabel: string) {
  const connectedSkills = DERIVED_SKILL_CONNECTIONS.filter((skill) => skill.sources.includes(source));
  if (connectedSkills.length < 2) return 0;

  const skillIndex = connectedSkills.findIndex((skill) => skill.label === skillLabel);
  if (skillIndex < 0) return 0;

  return (skillIndex - (connectedSkills.length - 1) / 2) * 0.84;
}

function routeLineTop(row: number, offsetRem = 0) {
  return `calc(${routeTop(row)} - 0.625rem + ${offsetRem}rem)`;
}

function routeTrunkTop(sourceRow: number, targetRow: number, sourceOffsetRem: number) {
  if (sourceRow < targetRow) {
    return `calc(${routeTopPercent(sourceRow)}% + ${sourceOffsetRem}rem)`;
  }

  return routeTop(targetRow);
}

function routeTrunkHeight(sourceRow: number, targetRow: number, sourceOffsetRem: number) {
  const distance = Math.abs(routeTopPercent(targetRow) - routeTopPercent(sourceRow));
  if (sourceRow < targetRow) {
    return `calc(${distance}% - ${sourceOffsetRem}rem)`;
  }

  return `calc(${distance}% + ${sourceOffsetRem}rem)`;
}

function ChevronSegment({
  color,
  orientation = "horizontal",
  style,
}: {
  color: string;
  orientation?: "horizontal" | "vertical-up" | "vertical-down";
  style: CSSProperties;
}) {
  const isHorizontal = orientation === "horizontal";
  const chevronCount = isHorizontal ? 34 : 18;
  const rotation =
    orientation === "vertical-up" ? "rotate(-90deg)" : orientation === "vertical-down" ? "rotate(90deg)" : undefined;

  return (
    <span
      aria-hidden="true"
      className={[
        "pointer-events-none absolute overflow-hidden",
        isHorizontal ? "flex h-5 items-center gap-0.5" : "flex w-5 flex-col items-center gap-0.5",
      ].join(" ")}
      style={style}
    >
      {Array.from({ length: chevronCount }, (_, index) => (
        <span
          key={index}
          className="text-base font-bold leading-none"
          style={{
            color: index % 2 === 0 ? "#f8fafc" : color,
            transform: rotation,
          }}
        >
          &rsaquo;
        </span>
      ))}
    </span>
  );
}

function DerivedSkillRoutingDiagram({ stats }: { stats: CharacterDerivedCombatStats }) {
  return (
    <div className="relative min-h-[17rem] overflow-visible">
      {DERIVED_SKILL_CONNECTIONS.flatMap((skill) =>
        skill.sources.flatMap((source) => {
          const sourceRow = ATTRIBUTE_ROUTE_ROWS[source];
          const sourceOffsetRem = routeLaneOffset(source, skill.label);
          const trunkX = routeTrunkX(skill);
          const lines = [
            <ChevronSegment
              key={`${skill.label}-${source}-source`}
              color={skill.color}
              style={{
                left: "0%",
                top: routeLineTop(sourceRow, sourceOffsetRem),
                width: `${trunkX + 1}%`,
              }}
            />,
          ];

          if (sourceRow !== skill.targetRow || sourceOffsetRem !== 0) {
            lines.push(
              <ChevronSegment
                key={`${skill.label}-${source}-trunk`}
                color={skill.color}
                orientation={sourceRow > skill.targetRow ? "vertical-up" : "vertical-down"}
                style={{
                  left: `calc(${trunkX}% - 0.625rem)`,
                  top: routeTrunkTop(sourceRow, skill.targetRow, sourceOffsetRem),
                  height: routeTrunkHeight(sourceRow, skill.targetRow, sourceOffsetRem),
                }}
              />,
            );
          }

          return lines;
        }),
      )}

      {DERIVED_SKILL_CONNECTIONS.map((skill) => {
        const trunkX = routeTrunkX(skill);
        return (
          <ChevronSegment
            key={`${skill.label}-merged-target`}
            color={skill.color}
            style={{
              left: `${trunkX}%`,
              top: `calc(${routeTop(skill.targetRow)} - 0.625rem)`,
              width: `${DERIVED_SKILL_LABEL_X - trunkX - 2}%`,
            }}
          />
        );
      })}

      {DERIVED_SKILL_CONNECTIONS.map((skill) => (
        <div
          key={skill.label}
          className="absolute grid grid-cols-[minmax(108px,1fr)_48px] items-center gap-3"
          style={{
            left: `${DERIVED_SKILL_LABEL_X}%`,
            right: "0.5rem",
            top: `calc(${routeTop(skill.targetRow)} - 1.25rem)`,
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-200">
            {skill.label}
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-lg font-semibold text-zinc-100">
            {skill.value(stats)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DerivedSkillValueColumn({ stats }: { stats: CharacterDerivedCombatStats }) {
  return (
    <div className="grid gap-3">
      {DERIVED_SKILL_CONNECTIONS.map((skill) => (
        <div key={skill.label} className="grid grid-cols-[minmax(112px,1fr)_48px] items-center gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
            {skill.label}
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-center text-lg font-semibold text-zinc-100">
            {skill.value(stats)}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatPowerOptionLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\bDEFENCE\b/g, "GUARD")
    .replace(/\bSUPPORT\b/g, "SYNERGY")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPowerTimingOptionLabel(value: EffectTimingType) {
  return POWER_EFFECT_TIMING_LABELS[value] ?? formatPowerOptionLabel(value);
}

function formatPowerNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function combatDieForAttributeValue(value: number): CombatDieSize {
  if (value >= 12) return "D12";
  if (value >= 10) return "D10";
  if (value >= 8) return "D8";
  if (value >= 6) return "D6";
  return "D4";
}

function warningTone(warning: string): "extreme" | "burst" | "watch" | "neutral" {
  if (/^Extreme burst review:/i.test(warning)) return "extreme";
  if (/^Burst warning:/i.test(warning)) return "burst";
  if (/^High offence pressure:/i.test(warning)) return "watch";
  return "neutral";
}

function warningBadgeLabel(warning: string) {
  const tone = warningTone(warning);
  if (tone === "extreme") return "Extreme burst review";
  if (tone === "burst") return "Burst warning";
  if (tone === "watch") return "Offence watch";
  return "Warning";
}

function warningBadgeClass(warning: string) {
  const tone = warningTone(warning);
  if (tone === "extreme") return "border-red-700 bg-red-950/50 text-red-100";
  if (tone === "burst") return "border-amber-600 bg-amber-950/40 text-amber-100";
  if (tone === "watch") return "border-cyan-700 bg-cyan-950/30 text-cyan-100";
  return "border-zinc-700 bg-zinc-900 text-zinc-200";
}

function warningCalloutClass(warning: string) {
  const tone = warningTone(warning);
  if (tone === "extreme") return "border-red-800 bg-red-950/30 text-red-100";
  if (tone === "burst") return "border-amber-700 bg-amber-950/30 text-amber-100";
  if (tone === "watch") return "border-cyan-800 bg-cyan-950/25 text-cyan-100";
  return "border-zinc-800 bg-zinc-950 text-zinc-200";
}

function getCharacterPowerCollapseKey(power: CharacterPower, index: number) {
  return power.id ? `power-${power.id}` : `power-${power.sortOrder ?? index}-${index}`;
}

function toggleStringValue(values: unknown, value: string) {
  const current = Array.isArray(values)
    ? values.map((entry) => String(entry)).filter(Boolean)
    : [];
  const lower = value.toLowerCase();
  return current.some((entry) => entry.toLowerCase() === lower)
    ? current.filter((entry) => entry.toLowerCase() !== lower)
    : [...current, value];
}

function equippedSlotsSignature(equippedSlots: CharacterBuilderData["equippedSlots"]) {
  return EQUIPMENT_SLOTS.map((slot) => `${slot}:${equippedSlots[slot] ?? ""}`).join("|");
}

function buildEquippedItemBullets(item: BuilderBackpackItem) {
  const template = item.itemTemplate;
  const bullets: string[] = [];

  for (const modifier of template.globalAttributeModifiers ?? []) {
    const bullet = formatCompactModifier(modifier.attribute, modifier.amount);
    if (bullet) bullets.push(bullet);
  }

  for (const section of template.descriptorSections) {
    for (const line of section.lines) {
      const bullet = compactEquippedItemLine(line);
      if (bullet) bullets.push(bullet);
    }
  }

  const hasCompactProtection = bullets.some((bullet) => /\+\d+\s+P[MP]V/i.test(bullet));
  if (!hasCompactProtection) {
    if (template.ppv && template.ppv > 0) bullets.push(`${template.ppv} PPV`);
    if (template.mpv && template.mpv > 0) bullets.push(`${template.mpv} MPV`);
  }

  if (bullets.length === 0 && template.generalDescription) {
    bullets.push(template.generalDescription);
  }

  const uniqueBullets: string[] = [];
  const seen = new Set<string>();
  for (const bullet of bullets) {
    const key = bullet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueBullets.push(bullet);
  }

  return uniqueBullets.slice(0, 8);
}

function equippedSlotDisplayLabel(slot: EquipmentSlotKey, item: BuilderBackpackItem) {
  return (slot === "mainHand" || slot === "offHand") &&
    item.itemTemplate.type === "WEAPON" &&
    item.itemTemplate.size === "TWO_HANDED"
    ? "Two-Handed"
    : EQUIPMENT_SLOT_LABELS[slot];
}

function EquippedItemMiniCard({
  slot,
  item,
  canEdit,
  saving,
  onClear,
}: {
  slot: EquipmentSlotKey;
  item: BuilderBackpackItem;
  canEdit: boolean;
  saving: boolean;
  onClear: () => void;
}) {
  const template = item.itemTemplate;
  const palette = getForgeRarityPalette(template.rarity);
  const slotLabel = equippedSlotDisplayLabel(slot, item);
  const itemName = template.name?.trim() || "(Unnamed item)";
  const meta = formatBackpackItemMeta(item);
  const imageUrl = isHttpUrl(template.itemUrl) ? template.itemUrl?.trim() : null;
  const bullets = buildEquippedItemBullets(item);

  return (
    <article
      className={`space-y-2 overflow-hidden rounded border p-2 ${palette.panelBorderClass} ${palette.panelShadowClass}`}
      style={{
        backgroundImage: palette.backgroundImage,
        borderColor: palette.panelBorderColor,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-zinc-500">{slotLabel}</p>
          <p
            className={`truncate text-sm ${palette.nameTextClass}`}
            style={{ color: palette.headerColor }}
          >
            {itemName}
            {meta ? ` - ${meta}` : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={!canEdit || saving}
          onClick={onClear}
          className={`shrink-0 rounded border px-2 py-1 text-xs transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${palette.panelBorderClass} ${palette.panelShadowClass} ${palette.attackLabelClass}`}
          style={{
            borderColor: palette.panelBorderColor,
            color: palette.attackLabelColor,
            backgroundColor: "rgba(3, 7, 18, 0.58)",
          }}
        >
          Unequip
        </button>
      </div>
      <div
        className={`grid h-[180px] grid-cols-[minmax(92px,42%)_1fr] gap-3 overflow-hidden rounded border p-2 ${palette.panelBorderClass} ${palette.panelShadowClass}`}
        style={{
          borderColor: palette.panelBorderColor,
          backgroundColor: "rgba(3, 7, 18, 0.34)",
        }}
      >
        <div
          className={`flex min-w-0 items-center justify-center overflow-hidden rounded border bg-black/20 ${palette.imageBorderClass}`}
          style={{
            borderColor: palette.panelBorderColor,
            boxShadow: `inset 0 0 18px rgba(0,0,0,0.35), 0 0 14px ${palette.outerBorderColor.replace(
              "/",
              "",
            )}`,
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${slotLabel} item preview`}
              className="max-h-full max-w-full object-contain"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <p className={`text-xs ${palette.descriptionTextClass}`} style={{ color: palette.bodyColor }}>
              No image
            </p>
          )}
        </div>
        <div
          className={`min-h-0 min-w-0 overflow-y-auto overflow-x-hidden rounded border p-2 pr-3 ${palette.panelBorderClass} ${palette.panelShadowClass}`}
          style={{
            borderColor: palette.panelBorderColor,
            backgroundColor: "rgba(3, 7, 18, 0.58)",
          }}
        >
          <p
            className={`mb-1 truncate text-[10px] uppercase tracking-wide ${palette.headerTextClass}`}
            style={{ color: palette.headerColor }}
          >
            Values
          </p>
          {bullets.length > 0 ? (
            <ul
              className={`list-disc space-y-0.5 pl-4 text-[11px] leading-snug ${palette.bodyTextClass}`}
              style={{ color: palette.bodyColor }}
            >
              {bullets.map((bullet) => (
                <li key={bullet} className="break-words">
                  {bullet}
                </li>
              ))}
            </ul>
          ) : (
            <p
              className={`text-[11px] leading-snug ${palette.descriptionTextClass}`}
              style={{ color: palette.bodyColor }}
            >
              No listed values.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function normalizeWholeNumberInput(value: string) {
  return value.replace(/\D/g, "");
}

function heroicRequiredCounts() {
  return HEROIC_ATTRIBUTE_ARRAY.reduce<Map<number, number>>((counts, value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  }, new Map());
}

async function readApiError(res: Response, fallback: string) {
  try {
    const payload = (await res.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {}
  return fallback;
}

export default function CharacterBuilderPage() {
  const router = useRouter();
  const params = useParams<{ id: string; characterId: string }>();
  const campaignId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const characterId = Array.isArray(params?.characterId)
    ? params.characterId[0]
    : params?.characterId ?? "";

  const [payload, setPayload] = useState<BuilderPayload | null>(null);
  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");
  const [previewTheme, setPreviewTheme] = useState<CharacterSheetTheme>("classic");
  const [attributeSwapDrafts, setAttributeSwapDrafts] = useState<Record<string, string>>({});
  const [selectedBackpackItemId, setSelectedBackpackItemId] = useState("");
  const [pendingHandEquipItemId, setPendingHandEquipItemId] = useState("");
  const [collapsedPowerKeys, setCollapsedPowerKeys] = useState<Record<string, boolean>>({});
  const [transferDraft, setTransferDraft] = useState<{
    backpackItemId: string;
    targetCharacterId: string;
    quantity: string;
  } | null>(null);
  const [transferringBackpackItem, setTransferringBackpackItem] = useState(false);
  const [powerDamageTypes, setPowerDamageTypes] = useState<PowerDamageTypeOption[]>([]);
  const protectionTuning = useProtectionTuning();

  const previewName = displayName(draft?.name ?? payload?.character.name);
  const previewLevel = Number(draft?.level ?? payload?.character.level ?? 1) || 1;
  const previewRace = draft?.race.trim() ?? payload?.character.race ?? "";
  const previewAge = draft?.age.trim() ?? payload?.character.age ?? "";
  const previewDescription =
    draft?.description.trim() ?? payload?.character.description ?? "";
  const builderData = draft?.builderData ?? defaultBuilderData();
  const isArchived = Boolean(payload?.character.archivedAt);
  const canEdit = Boolean(payload?.canEdit);
  const currentLevel = Math.max(1, Number(draft?.level ?? payload?.character.level ?? 1) || 1);
  const characteristicBudget = characterPoints(currentLevel);
  const characteristicSpent = totalCharacteristicCost(builderData.characteristics);
  const resistBudget = resistPointBudget(currentLevel);
  const resistSpent = CHARACTER_ATTRIBUTES.reduce(
    (sum, attribute) => sum + builderData.resistPoints[attribute],
    0,
  );
  const traitCatalog = payload?.traitCatalog ?? [];
  const backpackItems = payload?.backpackItems ?? EMPTY_BACKPACK_ITEMS;
  const transferTargets = payload?.transferTargets ?? EMPTY_TRANSFER_TARGETS;
  const selectedBackpackItem = useMemo(
    () => backpackItems.find((item) => item.id === selectedBackpackItemId) ?? null,
    [backpackItems, selectedBackpackItemId],
  );
  const pendingHandEquipItem = useMemo(
    () => backpackItems.find((item) => item.id === pendingHandEquipItemId) ?? null,
    [backpackItems, pendingHandEquipItemId],
  );
  const transferBackpackItem = useMemo(
    () =>
      transferDraft
        ? backpackItems.find((item) => item.id === transferDraft.backpackItemId) ?? null
        : null,
    [backpackItems, transferDraft],
  );
  const activeTraitCatalog = traitCatalog.filter((trait) => trait.isActive !== false);
  const traitSummary = selectedTraitSummary(
    builderData.selectedTraitKeys,
    currentLevel,
    activeTraitCatalog,
  );
  const selectedNegativeTraitCount = activeTraitCatalog.filter(
    (trait) =>
      trait.classification === "NEGATIVE" &&
      builderData.selectedTraitKeys.includes(trait.id),
  ).length;
  const positiveTraits = activeTraitCatalog.filter(
    (trait) => trait.classification === "POSITIVE",
  );
  const visibleNegativeTraits = activeTraitCatalog.filter(
    (trait) =>
      trait.classification === "NEGATIVE" &&
      (selectedNegativeTraitCount < 2 || builderData.selectedTraitKeys.includes(trait.id)),
  );
  const builderValidationErrors = validateBuilderData(builderData, currentLevel, activeTraitCatalog);
  const attributeValidationErrors = validateAttributes(
    builderData.attributeMethod,
    builderData.attributes,
  );
  const resistValidationErrors = validateResistPoints(currentLevel, builderData.resistPoints);
  const equippedUseCounts = getEquipmentSlotUseCounts(builderData.equippedSlots);
  const mainHandItem = builderData.equippedSlots.mainHand
    ? backpackItems.find((item) => item.id === builderData.equippedSlots.mainHand)
    : null;
  const isOffHandLocked =
    mainHandItem?.itemTemplate.type === "WEAPON" &&
    mainHandItem.itemTemplate.size === "TWO_HANDED";
  const derivedCombatStats = useMemo(
    () =>
      buildCharacterDerivedCombatStats({
        level: currentLevel,
        builderData,
        backpackItems: backpackItems as CharacterBuilderDerivedBackpackItem[],
        protectionTuning,
      }),
    [backpackItems, builderData, currentLevel, protectionTuning],
  );
  const persistedEquippedSlots = payload?.character.builderData.equippedSlots ?? {};
  const hasUnsavedEquipmentChanges =
    equippedSlotsSignature(builderData.equippedSlots) !==
    equippedSlotsSignature(persistedEquippedSlots);
  const getAttributeModifierValue = (attribute: CharacterAttribute) =>
    derivedCombatStats.itemModifiers[ATTRIBUTE_MODIFIER_FIELDS[attribute]] ?? 0;
  const attackAttributeValue = Number(builderData.attributes.Attack);
  const offencePressureDie = combatDieForAttributeValue(
    (Number.isFinite(attackAttributeValue) ? attackAttributeValue : 0) +
      Math.max(0, getAttributeModifierValue("Attack")),
  );
  const signatureMoveDraft = useMemo(
    () => builderData.signatureMove ?? createDefaultCharacterPower(0),
    [builderData.signatureMove],
  );
  const signatureMovePowers = useMemo(
    () => (builderData.signatureMove ? [builderData.signatureMove] : []),
    [builderData.signatureMove],
  );
  const signatureMoveBudget = useMemo(
    () =>
      summarizeCharacterPowers({
        level: currentLevel,
        powers: signatureMovePowers,
        tuningSnapshot: payload?.powerTuning ?? null,
        playerPowerSpendScalar: payload?.characterBuilderTuning?.playerPowerSpendScalar,
        powerPool: signatureMovePointPool(currentLevel),
        offencePressureMode: "reviewOnly",
        offencePressureDie,
      }),
    [signatureMovePowers, currentLevel, payload?.powerTuning, payload?.characterBuilderTuning?.playerPowerSpendScalar, offencePressureDie],
  );
  const signatureMoveEditorBudget = useMemo(
    () =>
      summarizeCharacterPowers({
        level: currentLevel,
        powers: [signatureMoveDraft],
        tuningSnapshot: payload?.powerTuning ?? null,
        playerPowerSpendScalar: payload?.characterBuilderTuning?.playerPowerSpendScalar,
        powerPool: signatureMovePointPool(currentLevel),
        offencePressureMode: "reviewOnly",
        offencePressureDie,
      }),
    [signatureMoveDraft, currentLevel, payload?.powerTuning, payload?.characterBuilderTuning?.playerPowerSpendScalar, offencePressureDie],
  );
  const powerBudget = useMemo(
    () =>
      summarizeCharacterPowers({
        level: currentLevel,
        powers: builderData.powers,
        tuningSnapshot: payload?.powerTuning ?? null,
        playerPowerSpendScalar: payload?.characterBuilderTuning?.playerPowerSpendScalar,
        offencePressureDie,
      }),
    [builderData.powers, currentLevel, payload?.powerTuning, payload?.characterBuilderTuning?.playerPowerSpendScalar, offencePressureDie],
  );
  const powerValidationErrors = useMemo(
    () =>
      validateCharacterPowers({
        level: currentLevel,
        powers: builderData.powers,
        tuningSnapshot: payload?.powerTuning ?? null,
        playerPowerSpendScalar: payload?.characterBuilderTuning?.playerPowerSpendScalar,
      }),
    [builderData.powers, currentLevel, payload?.powerTuning, payload?.characterBuilderTuning?.playerPowerSpendScalar],
  );
  const signatureMoveValidationErrors = useMemo(
    () =>
      validateCharacterPowers({
        level: currentLevel,
        powers: signatureMovePowers,
        tuningSnapshot: payload?.powerTuning ?? null,
        playerPowerSpendScalar: payload?.characterBuilderTuning?.playerPowerSpendScalar,
        powerPool: signatureMovePointPool(currentLevel),
        powerLabel: "Signature Move",
        poolDescription: "Character Level x 20",
        offencePressureMode: "reviewOnly",
      }),
    [signatureMovePowers, currentLevel, payload?.powerTuning, payload?.characterBuilderTuning?.playerPowerSpendScalar],
  );
  const blockingSaveErrors = useMemo(
    () => [
      ...builderValidationErrors,
      ...powerValidationErrors,
      ...signatureMoveValidationErrors,
    ],
    [builderValidationErrors, powerValidationErrors, signatureMoveValidationErrors],
  );
  const canSave =
    canEdit &&
    !saving &&
    blockingSaveErrors.length === 0;

  const builderApiUrl = useMemo(() => {
    if (!campaignId || !characterId) return "";
    return `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(
      characterId,
    )}/builder`;
  }, [campaignId, characterId]);

  async function loadBuilder() {
    if (!builderApiUrl) {
      setError("Missing campaign or character id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(builderApiUrl, {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as BuilderPayload;

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        setError("You do not have access to this character builder.");
        return;
      }
      if (res.status === 404) {
        setError("Character not found.");
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load character builder.");
      }

      setPayload(data);
      setDraft(makeDraft(data.character));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load builder.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBuilder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderApiUrl]);

  useEffect(() => {
    let cancelled = false;
    async function loadPowerPicklists() {
      try {
        const res = await fetch("/api/summoning-circle/picklists", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { damageTypes?: Array<{ id?: unknown; name?: unknown; attackMode?: unknown }> };
        const rows = Array.isArray(json.damageTypes) ? json.damageTypes : [];
        const next = rows
          .map((row) => ({
            id: typeof row.id === "number" ? row.id : Number(row.id),
            name: typeof row.name === "string" ? row.name : "",
            attackMode: String(row.attackMode ?? "").toUpperCase() === "MENTAL" ? "MENTAL" as const : "PHYSICAL" as const,
          }))
          .filter((row): row is PowerDamageTypeOption => Number.isFinite(row.id) && row.name.trim().length > 0);
        if (!cancelled) setPowerDamageTypes(next);
      } catch {
        if (!cancelled) setPowerDamageTypes([]);
      }
    }
    void loadPowerPicklists();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      selectedBackpackItemId &&
      !backpackItems.some((item) => item.id === selectedBackpackItemId)
    ) {
      setSelectedBackpackItemId("");
    }
    if (
      pendingHandEquipItemId &&
      !backpackItems.some((item) => item.id === pendingHandEquipItemId)
    ) {
      setPendingHandEquipItemId("");
    }
    if (
      transferDraft &&
      (!backpackItems.some((item) => item.id === transferDraft.backpackItemId) ||
        !transferTargets.some((target) => target.characterId === transferDraft.targetCharacterId))
    ) {
      setTransferDraft(null);
    }
  }, [backpackItems, pendingHandEquipItemId, selectedBackpackItemId, transferDraft, transferTargets]);

  function updateDraft(patch: Partial<BuilderDraft>) {
    setDraft((current) => ({
      name: current?.name ?? "",
      imageUrl: current?.imageUrl ?? "",
      age: current?.age ?? "",
      race: current?.race ?? "",
      description: current?.description ?? "",
      level: current?.level ?? "1",
      builderData: current?.builderData ?? defaultBuilderData(),
      ...patch,
    }));
  }

  function updateBuilderData(patch: Partial<CharacterBuilderData>) {
    updateDraft({
      builderData: {
        ...builderData,
        ...patch,
      },
    });
  }

  function updatePowers(powers: CharacterPower[]) {
    updateBuilderData({
      powers: powers.map((power, index) => ({ ...power, sortOrder: index })),
    });
  }

  function updateSignatureMove(power: CharacterPower | null) {
    updateBuilderData({
      signatureMove: power ? reconcilePowerPacketTimingForUi({ ...power, sortOrder: 0 }) : null,
    });
  }

  function addPower() {
    const nextPowerIndex = builderData.powers.length;
    const nextPower = createDefaultCharacterPower(nextPowerIndex);
    const nextPowerCollapseKey = getCharacterPowerCollapseKey(nextPower, nextPowerIndex);
    updatePowers([...builderData.powers, nextPower]);
    setCollapsedPowerKeys((prev) => ({
      ...prev,
      [nextPowerCollapseKey]: false,
    }));
  }

  function removePower(index: number) {
    const power = builderData.powers[index];
    if (power) {
      const collapseKey = getCharacterPowerCollapseKey(power, index);
      setCollapsedPowerKeys((prev) => {
        if (!(collapseKey in prev)) return prev;
        const next = { ...prev };
        delete next[collapseKey];
        return next;
      });
    }
    updatePowers(builderData.powers.filter((_, candidateIndex) => candidateIndex !== index));
  }

  function updatePower(index: number, patch: Partial<CharacterPower>) {
    if (index === SIGNATURE_MOVE_POWER_INDEX) {
      updateSignatureMove({ ...signatureMoveDraft, ...patch } as CharacterPower);
      return;
    }
    updatePowers(
      builderData.powers.map((power, candidateIndex) => {
        if (candidateIndex !== index) return power;
        return reconcilePowerPacketTimingForUi({ ...power, ...patch } as CharacterPower);
      }),
    );
  }

  function updatePowerPacket(
    powerIndex: number,
    packetIndex: number,
    patch: Partial<CharacterPower["effectPackets"][number]>,
  ) {
    const power = powerIndex === SIGNATURE_MOVE_POWER_INDEX
      ? signatureMoveDraft
      : builderData.powers[powerIndex];
    if (!power) return;
    const packets = power.effectPackets.length > 0 ? power.effectPackets : [
      createDefaultCharacterPowerPacket("ATTACK", 0),
    ];
    const nextPackets = packets.map((packet, candidateIndex) =>
      candidateIndex === packetIndex ? { ...packet, ...patch } : packet,
    );
    updatePower(powerIndex, { effectPackets: nextPackets, intentions: nextPackets });
  }

  function updatePowerPacketDetails(
    powerIndex: number,
    packetIndex: number,
    detailsPatch: Record<string, unknown>,
  ) {
    const sourcePower = powerIndex === SIGNATURE_MOVE_POWER_INDEX
      ? signatureMoveDraft
      : builderData.powers[powerIndex];
    const packet = sourcePower?.effectPackets[packetIndex];
    if (!packet) return;
    const woundChannelPatch =
      packet.intention === "ATTACK" && (detailsPatch.attackMode === "PHYSICAL" || detailsPatch.attackMode === "MENTAL")
        ? { woundChannel: detailsPatch.attackMode as EffectPacket["woundChannel"] }
        : packet.intention === "HEALING" && (detailsPatch.healingMode === "PHYSICAL" || detailsPatch.healingMode === "MENTAL")
          ? { woundChannel: detailsPatch.healingMode as EffectPacket["woundChannel"] }
          : {};
    updatePowerPacket(powerIndex, packetIndex, {
      ...woundChannelPatch,
      detailsJson: {
        ...(packet.detailsJson ?? {}),
        ...detailsPatch,
      },
    });
  }

  function addPowerPacket(powerIndex: number) {
    const power = powerIndex === SIGNATURE_MOVE_POWER_INDEX
      ? signatureMoveDraft
      : builderData.powers[powerIndex];
    if (!power || power.effectPackets.length >= 4) return;
    const nextPacket = createDefaultCharacterPowerPacket("ATTACK", power.effectPackets.length);
    const nextPackets = [...power.effectPackets, nextPacket];
    updatePower(powerIndex, { effectPackets: nextPackets, intentions: nextPackets });
  }

  function removePowerPacket(powerIndex: number, packetIndex: number) {
    const power = powerIndex === SIGNATURE_MOVE_POWER_INDEX
      ? signatureMoveDraft
      : builderData.powers[powerIndex];
    if (!power || power.effectPackets.length <= 1) return;
    const nextPackets = power.effectPackets
      .filter((_, candidateIndex) => candidateIndex !== packetIndex)
      .map((packet, index) => ({ ...packet, sortOrder: index, packetIndex: index }));
    updatePower(powerIndex, { effectPackets: nextPackets, intentions: nextPackets });
  }

  function togglePowerCollapsed(collapseKey: string, defaultCollapsed = false) {
    setCollapsedPowerKeys((prev) => {
      const collapsed = prev[collapseKey] ?? defaultCollapsed;
      return {
        ...prev,
        [collapseKey]: !collapsed,
      };
    });
  }


  function renderPowerEditorCards(params: {
    powers: CharacterPower[];
    budget: ReturnType<typeof summarizeCharacterPowers>;
    emptyMessage: string;
    getPowerIndex?: (index: number) => number;
    getPowerFallbackName?: (index: number) => string;
    allowRemove?: boolean;
    defaultCollapsed?: boolean;
  }) {
    const {
      powers,
      budget,
      emptyMessage,
      getPowerIndex = (index) => index,
      getPowerFallbackName = (index) => `Power ${index + 1}`,
      allowRemove = true,
      defaultCollapsed = false,
    } = params;

    return powers.length === 0 ? (
      <p className="rounded-lg border border-dashed border-zinc-800 bg-black p-4 text-sm text-zinc-500">
        {emptyMessage}
      </p>
    ) : (
      <div className="space-y-4">
        {powers.map((power, localPowerIndex) => {
          const powerIndex = getPowerIndex(localPowerIndex);
          const powerFallbackName = getPowerFallbackName(localPowerIndex);
                const summary = budget.powers[localPowerIndex];
                const primaryPacket =
                  power.effectPackets[0] ?? createDefaultCharacterPowerPacket("ATTACK", 0);
                const primaryDetails =
                  primaryPacket.detailsJson && typeof primaryPacket.detailsJson === "object"
                    ? (primaryPacket.detailsJson as Record<string, unknown>)
                    : {};
                const rangeCategory = String(primaryDetails.rangeCategory ?? "MELEE");
                const rangeExtra =
                  primaryDetails.rangeExtra &&
                  typeof primaryDetails.rangeExtra === "object" &&
                  !Array.isArray(primaryDetails.rangeExtra)
                    ? (primaryDetails.rangeExtra as Record<string, unknown>)
                    : {};
                const descriptorChassis = power.descriptorChassis ?? "IMMEDIATE";
                const commitmentModifier = power.commitmentModifier ?? "STANDARD";
                const allowedCommitmentOptions = getCharacterPowerAllowedCommitmentOptions(descriptorChassis);
                const displayedCommitment = allowedCommitmentOptions.includes(commitmentModifier)
                  ? commitmentModifier
                  : allowedCommitmentOptions[0] ?? "STANDARD";
                const allowedCounterOptions = getCharacterPowerAllowedCounterOptions({
                  descriptorChassis,
                  commitmentModifier: displayedCommitment,
                  chargeType: power.chargeType,
                });
                const displayedCounter = allowedCounterOptions.includes(power.counterMode ?? "NO")
                  ? power.counterMode ?? "NO"
                  : "NO";
                const allowedLifespanOptions = getCharacterPowerAllowedLifespanOptions(
                  descriptorChassis,
                  displayedCommitment,
                );
                const showLifespanControls = descriptorChassis !== "IMMEDIATE" || displayedCommitment !== "STANDARD";
                const displayedLifespan = allowedLifespanOptions.includes(power.lifespanType ?? "NONE")
                  ? power.lifespanType ?? "NONE"
                  : allowedLifespanOptions[0] ?? "NONE";
                const rangeOptions = getCharacterPowerAllowedRangeCategories({
                  descriptorChassis,
                  attachedHostAnchorType: power.attachedHostAnchorType,
                });
                const displayedRangeCategory = rangeOptions.includes(rangeCategory as CharacterPowerRangeCategory)
                  ? rangeCategory
                  : rangeOptions[0] ?? rangeCategory;
                const triggerConditionOptions = getCharacterPowerAllowedTriggerConditionOptions({
                  triggerMethod: power.triggerMethod,
                  rangeCategory: displayedRangeCategory as CharacterPowerRangeCategory,
                });
                const selectedTriggerCondition =
                  descriptorChassis === "TRIGGER"
                    ? primaryPacket.triggerConditionText ?? ""
                    : "";
                const selectedAttachedHostileEntryPattern = readCharacterPowerAttachedHostileEntryPattern(power) ?? "";
                const selectedReserveReleaseBehaviour =
                  typeof power.descriptorChassisConfig?.releaseBehaviour === "string"
                    ? power.descriptorChassisConfig.releaseBehaviour
                    : "";
                const powerCollapseKey = getCharacterPowerCollapseKey(power, powerIndex);
                const powerCollapsed = collapsedPowerKeys[powerCollapseKey] ?? defaultCollapsed;
                const powerBodyId = `character-power-body-${powerIndex}`;
                return (
                  <article
                    key={`${power.sortOrder}-${powerIndex}`}
                    className="rounded-lg border border-zinc-800 bg-black p-3"
                    data-testid="character-power-card"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <button
                        type="button"
                        onClick={() => togglePowerCollapsed(powerCollapseKey, defaultCollapsed)}
                        className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-left hover:bg-zinc-900/40"
                        aria-expanded={!powerCollapsed}
                        aria-controls={powerBodyId}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="min-w-0 truncate font-semibold">
                            <span className="mr-2 text-zinc-400" aria-hidden="true">
                              {powerCollapsed ? ">" : "v"}
                            </span>
                            {power.name.trim() || powerFallbackName}
                          </h3>
                          {powerCollapsed ? (
                            <span className="shrink-0 text-[11px] text-zinc-500">
                              Effect Packets: {power.effectPackets.length}
                            </span>
                          ) : null}
                        </div>
                        {summary?.costValid ? (
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-400">
                            <span className="rounded border border-zinc-800 px-2 py-1">
                              Player Spend {formatPowerNumber(summary.spend ?? 0)}
                            </span>
                            <span className="rounded border border-zinc-800 px-2 py-1">
                              Base Value {formatPowerNumber(summary.basePowerValue ?? 0)}
                            </span>
                            <span className="rounded border border-zinc-800 px-2 py-1">
                              Spend Scalar x{formatPowerNumber(summary.playerPowerSpendScalar)}
                            </span>
                            <span className="rounded border border-zinc-800 px-2 py-1">
                              Cooldown {summary.derivedCooldownTurns ?? 1}
                            </span>
                            {summary.warnings.map((warning) => (
                              <span
                                key={`${powerCollapseKey}-warning-${warning}`}
                                className={`rounded border px-2 py-1 font-medium ${warningBadgeClass(warning)}`}
                              >
                                {warningBadgeLabel(warning)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div
                            className="mt-1 flex flex-wrap gap-2 text-xs text-red-300"
                            data-testid="character-power-invalid-summary"
                          >
                            <span className="rounded border border-red-900 bg-red-950/20 px-2 py-1">
                              Invalid
                            </span>
                            <span className="rounded border border-red-900 bg-red-950/20 px-2 py-1">
                              {summary?.invalidCostReason ?? "Power is invalid."}
                            </span>
                          </div>
                        )}
                      </button>
                      {allowRemove ? (
                      <button
                        type="button"
                        onClick={() => removePower(powerIndex)}
                        disabled={!canEdit || saving}
                        className="rounded-lg border border-red-900 px-3 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove Power
                      </button>
                      ) : null}
                    </div>

                    {!powerCollapsed ? (
                      <div id={powerBodyId}>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="text-xs text-zinc-400">Power Name</span>
                        <input
                          type="text"
                          value={power.name}
                          onChange={(event) => updatePower(powerIndex, { name: event.target.value })}
                          disabled={!canEdit || saving}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-zinc-400">Descriptor Chassis</span>
                        <select
                          value={power.descriptorChassis ?? "IMMEDIATE"}
                          onChange={(event) => {
                            const nextChassis = event.target.value as DescriptorChassisType;
                            const nextCommitmentOptions = getCharacterPowerAllowedCommitmentOptions(nextChassis);
                            const nextCommitment = nextCommitmentOptions.includes(power.commitmentModifier ?? "STANDARD")
                              ? power.commitmentModifier ?? "STANDARD"
                              : nextCommitmentOptions[0] ?? "STANDARD";
                            const nextPackets =
                              nextChassis === "FIELD"
                                ? power.effectPackets.map((packet, packetIndex) =>
                                    packetIndex === 0
                                      ? {
                                          ...packet,
                                          detailsJson: {
                                            ...(packet.detailsJson ?? {}),
                                            ...createCharacterPowerRangeDetails("AOE"),
                                          },
                                        }
                                      : packet,
                                  )
                                : power.effectPackets;
                            updatePower(powerIndex, {
                              descriptorChassis: nextChassis,
                              commitmentModifier: nextCommitment,
                              counterMode: getCharacterPowerAllowedCounterOptions({
                                descriptorChassis: nextChassis,
                                commitmentModifier: nextCommitment,
                                chargeType: power.chargeType,
                              }).includes(power.counterMode ?? "NO")
                                ? power.counterMode ?? "NO"
                                : "NO",
                              lifespanType: getCharacterPowerAllowedLifespanOptions(nextChassis, nextCommitment).includes(power.lifespanType ?? "NONE")
                                ? power.lifespanType ?? "NONE"
                                : getCharacterPowerAllowedLifespanOptions(nextChassis, nextCommitment)[0] ?? "NONE",
                              effectPackets: nextPackets,
                              intentions: nextPackets,
                            });
                          }}
                          disabled={!canEdit || saving}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                        >
                          {POWER_CHASSIS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      {descriptorChassis !== "TRIGGER" ? (
                        <label className="block">
                          <span className="text-xs text-zinc-400">Counter</span>
                          <select
                            value={displayedCounter}
                            onChange={(event) =>
                              updatePower(powerIndex, {
                                counterMode: event.target.value as CharacterPower["counterMode"],
                              })
                            }
                            disabled={!canEdit || saving || allowedCounterOptions.length <= 1}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                          >
                            {allowedCounterOptions.map((option) => (
                              <option key={option} value={option}>
                                {option === "YES" ? "Yes" : "No"}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label className="block">
                        <span className="text-xs text-zinc-400">Commitment</span>
                        <select
                          value={displayedCommitment}
                          onChange={(event) => {
                            const nextCommitment = event.target.value as CharacterPower["commitmentModifier"];
                            updatePower(powerIndex, {
                              commitmentModifier: nextCommitment,
                              counterMode: getCharacterPowerAllowedCounterOptions({
                                descriptorChassis,
                                commitmentModifier: nextCommitment,
                                chargeType: power.chargeType,
                              }).includes(power.counterMode ?? "NO")
                                ? power.counterMode ?? "NO"
                                : "NO",
                              lifespanType: getCharacterPowerAllowedLifespanOptions(descriptorChassis, nextCommitment).includes(power.lifespanType ?? "NONE")
                                ? power.lifespanType ?? "NONE"
                                : getCharacterPowerAllowedLifespanOptions(descriptorChassis, nextCommitment)[0] ?? "NONE",
                            });
                          }}
                          disabled={!canEdit || saving}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                        >
                          {allowedCommitmentOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      {displayedCommitment === "CHARGE" ? (
                        <>
                          <label className="block">
                            <span className="text-xs text-zinc-400">Charge Type</span>
                            <select
                              value={power.chargeType ?? "DELAYED_RELEASE"}
                              onChange={(event) =>
                                updatePower(powerIndex, {
                                  chargeType: event.target.value as CharacterPower["chargeType"],
                                  counterMode: event.target.value === "DELAYED_RELEASE" ? "NO" : power.counterMode,
                                })
                              }
                              disabled={!canEdit || saving}
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                            >
                              <option value="DELAYED_RELEASE">{POWER_CHARGE_TYPE_LABELS.DELAYED_RELEASE}</option>
                              <option value="BUILD_POWER">{POWER_CHARGE_TYPE_LABELS.BUILD_POWER}</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs text-zinc-400">Charge Turns</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={power.chargeTurns ?? 1}
                              onChange={(event) =>
                                updatePower(powerIndex, {
                                  chargeTurns: Number(event.target.value),
                                })
                              }
                              disabled={!canEdit || saving}
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                            />
                          </label>
                          {power.chargeType === "BUILD_POWER" ? (
                            <label className="block">
                              <span className="text-xs text-zinc-400">Bonus Dice / Turn</span>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                step={1}
                                value={power.chargeBonusDicePerTurn ?? 1}
                                onChange={(event) =>
                                  updatePower(powerIndex, {
                                    chargeBonusDicePerTurn: Number(event.target.value),
                                  })
                                }
                                disabled={!canEdit || saving}
                                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                              />
                            </label>
                          ) : null}
                        </>
                      ) : null}
                      {power.descriptorChassis === "TRIGGER" ? (
                        <>
                          <label className="block">
                            <span className="text-xs text-zinc-400">Trigger Method</span>
                            <select
                              value={power.triggerMethod ?? "ARM_AND_THEN_TARGET"}
                              onChange={(event) =>
                                updatePower(powerIndex, {
                                  triggerMethod: event.target.value as CharacterPower["triggerMethod"],
                                })
                              }
                              disabled={!canEdit || saving}
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                            >
                              <option value="ARM_AND_THEN_TARGET">{POWER_TRIGGER_METHOD_LABELS.ARM_AND_THEN_TARGET}</option>
                              <option value="TARGET_AND_THEN_ARM">{POWER_TRIGGER_METHOD_LABELS.TARGET_AND_THEN_ARM}</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs text-zinc-400">Trigger Condition</span>
                            <select
                              value={selectedTriggerCondition}
                              onChange={(event) =>
                                updatePowerPacket(powerIndex, 0, {
                                  triggerConditionText: event.target.value || null,
                                })
                              }
                              disabled={!canEdit || saving}
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                            >
                              <option value="">Choose...</option>
                              {triggerConditionOptions.map((option) => (
                                <option key={option} value={option}>
                                  {POWER_TRIGGER_CONDITION_LABELS[option]}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : null}
                      {power.descriptorChassis === "ATTACHED" ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="text-xs text-zinc-400">Attached Host</span>
                            <select
                              value={power.attachedHostAnchorType ?? "TARGET"}
                              onChange={(event) =>
                                updatePower(powerIndex, {
                                  attachedHostAnchorType:
                                    event.target.value as CharacterPower["attachedHostAnchorType"],
                                  descriptorChassisConfig: {
                                    ...(power.descriptorChassisConfig ?? {}),
                                    anchorText:
                                      POWER_ATTACHED_HOST_ANCHOR_TEXT[
                                        event.target.value as NonNullable<CharacterPower["attachedHostAnchorType"]>
                                      ],
                                  },
                                })
                              }
                              disabled={!canEdit || saving}
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                            >
                              {Object.entries(POWER_ATTACHED_HOST_ANCHOR_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs text-zinc-400">Attached Payload Gate</span>
                            <select
                              value={
                                selectedAttachedHostileEntryPattern
                              }
                              onChange={(event) =>
                                updatePower(powerIndex, {
                                  descriptorChassisConfig: {
                                    ...(power.descriptorChassisConfig ?? {}),
                                    hostileEntryPattern: event.target.value || null,
                                  },
                                })
                              }
                              disabled={!canEdit || saving}
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                            >
                              <option value="">Choose...</option>
                              <option value="ON_ATTACH">ON_ATTACH</option>
                              <option value="ON_PAYLOAD">ON_PAYLOAD</option>
                            </select>
                          </label>
                        </div>
                      ) : null}
                      {power.descriptorChassis === "RESERVE" ? (
                        <label className="block">
                          <span className="text-xs text-zinc-400">Release Behaviour</span>
                          <select
                            value={selectedReserveReleaseBehaviour}
                            onChange={(event) =>
                              updatePower(powerIndex, {
                                descriptorChassisConfig: {
                                  ...(power.descriptorChassisConfig ?? {}),
                                  releaseBehaviour: event.target.value || null,
                                },
                              })
                            }
                            disabled={!canEdit || saving}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                          >
                            <option value="">Choose...</option>
                            {CHARACTER_POWER_RESERVE_RELEASE_BEHAVIOUR_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {POWER_RESERVE_RELEASE_BEHAVIOUR_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {showLifespanControls ? (
                        <>
                          <label className="block">
                            <span className="text-xs text-zinc-400">Lifespan</span>
                            <select
                              value={displayedLifespan}
                              onChange={(event) =>
                                updatePower(powerIndex, {
                                  lifespanType: event.target.value as CharacterPower["lifespanType"],
                                  lifespanTurns:
                                    event.target.value === "TURNS" ? (power.lifespanTurns ?? 1) : null,
                                })
                              }
                              disabled={!canEdit || saving}
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                            >
                              {allowedLifespanOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          {displayedLifespan === "TURNS" ? (
                            <label className="block">
                              <span className="text-xs text-zinc-400">Lifespan Turns</span>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={power.lifespanTurns ?? 1}
                                onChange={(event) =>
                                  updatePower(powerIndex, {
                                    lifespanTurns: Number(event.target.value),
                                  })
                                }
                                disabled={!canEdit || saving}
                                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                              />
                            </label>
                          ) : null}
                        </>
                      ) : null}
                      <label className="block md:col-span-2">
                        <span className="text-xs text-zinc-400">Description</span>
                        <textarea
                          value={power.description ?? ""}
                          onChange={(event) => updatePower(powerIndex, { description: event.target.value })}
                          disabled={!canEdit || saving}
                          className="mt-1 min-h-20 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                        />
                      </label>
                    </div>

                    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold">Primary Packet</h4>
                        <button
                          type="button"
                          onClick={() => addPowerPacket(powerIndex)}
                          disabled={!canEdit || saving || power.effectPackets.length >= 4}
                          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Add Packet
                        </button>
                      </div>

                      <div className="mt-3 space-y-3">
                        {power.effectPackets.map((packet, packetIndex) => {
                          const packetDetails =
                            packet.detailsJson && typeof packet.detailsJson === "object"
                              ? (packet.detailsJson as Record<string, unknown>)
                              : {};
                          const timingAuthorable = isCharacterPowerPacketTimingAuthorable(power, packetIndex);
                          const timingOptions = timingAuthorable
                            ? getCharacterPowerAllowedTimingOptions(power, packetIndex)
                            : [];
                          const currentTiming = packet.effectTimingType ?? "ON_CAST";
                          const currentTimingIsLegal = timingOptions.includes(currentTiming);
                          const requiresAttachedHostileEntryBeforeTiming = !timingAuthorable;
                          const durationOptions = getCharacterPowerAllowedDurationOptions(packet.effectTimingType);
                          const applyToOptions = getCharacterPowerAllowedApplyToOptions(power, packet);
                          const triggerConditionOptions = getCharacterPowerAllowedTriggerConditionOptions({
                            triggerMethod: power.triggerMethod,
                            rangeCategory: displayedRangeCategory as "SELF" | "MELEE" | "RANGED" | "AOE",
                          });
                          const selectedDamageTypes = Array.isArray(packetDetails.damageTypes)
                            ? packetDetails.damageTypes.map((entry) => String(entry)).filter(Boolean)
                            : [];
                          const attackMode = String(packetDetails.attackMode ?? "PHYSICAL").toUpperCase() === "MENTAL"
                            ? "MENTAL"
                            : "PHYSICAL";
                          const defenceMode = CHARACTER_POWER_DEFENCE_MODES.includes(
                            String(packetDetails.defenceMode ?? "Block") as (typeof CHARACTER_POWER_DEFENCE_MODES)[number],
                          )
                            ? String(packetDetails.defenceMode ?? "Block")
                            : "Block";
                          const resistedAttribute = CHARACTER_POWER_DEFENCE_RESISTED_ATTRIBUTES.includes(
                            String(packetDetails.resistedAttribute ?? "") as (typeof CHARACTER_POWER_DEFENCE_RESISTED_ATTRIBUTES)[number],
                          )
                            ? String(packetDetails.resistedAttribute)
                            : "Fortitude";
                          const damageTypeOptions =
                            (powerDamageTypes.length > 0 ? powerDamageTypes : CHARACTER_POWER_FALLBACK_DAMAGE_TYPES)
                              .filter((row) => row.attackMode === attackMode);
                          return (
                          <div key={`${powerIndex}-${packetIndex}`} className="rounded border border-zinc-800 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase text-zinc-500">
                                Packet {packetIndex + 1}
                              </div>
                              {packetIndex > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => removePowerPacket(powerIndex, packetIndex)}
                                  disabled={!canEdit || saving}
                                  className="rounded border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                              <label className="block">
                                <span className="text-xs text-zinc-400">Packet Intention</span>
                                <select
                                  value={packet.intention}
                                  onChange={(event) => {
                                    const nextPacket = createDefaultCharacterPowerPacket(
                                      event.target.value as PowerIntention,
                                      packetIndex,
                                    );
                                    updatePowerPacket(powerIndex, packetIndex, nextPacket);
                                  }}
                                  disabled={!canEdit || saving}
                                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                >
                                  {POWER_INTENTION_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {isCharacterPowerSecondaryDiceAuthored(packetIndex) ? (
                                <label className="block">
                                  <span className="text-xs text-zinc-400">Dice</span>
                                  <select
                                    value={packet.diceCount ?? power.diceCount}
                                    onChange={(event) =>
                                      updatePowerPacket(powerIndex, packetIndex, {
                                        diceCount: Number(event.target.value),
                                      })
                                    }
                                    disabled={!canEdit || saving}
                                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                  >
                                    {Array.from({ length: CHARACTER_POWER_MAX_DICE_COUNT }, (_, optionIndex) => optionIndex + 1).map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                              <label className="block">
                                <span className="text-xs text-zinc-400">Potency</span>
                                <select
                                  value={packet.potency ?? power.potency}
                                  onChange={(event) =>
                                    updatePowerPacket(powerIndex, packetIndex, {
                                      potency: Number(event.target.value),
                                    })
                                  }
                                  disabled={!canEdit || saving}
                                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                >
                                  {Array.from({ length: CHARACTER_POWER_MAX_POTENCY }, (_, optionIndex) => optionIndex + 1).map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block">
                                <span className="text-xs text-zinc-400">Timing</span>
                                <select
                                  value={packet.effectTimingType ?? "ON_CAST"}
                                  onChange={(event) =>
                                    updatePowerPacket(powerIndex, packetIndex, {
                                      effectTimingType: event.target.value as EffectTimingType,
                                    })
                                  }
                                  disabled={!canEdit || saving || requiresAttachedHostileEntryBeforeTiming}
                                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                >
                                  {!currentTimingIsLegal ? (
                                    <option value={currentTiming}>
                                      Illegal: {formatPowerTimingOptionLabel(currentTiming)}
                                    </option>
                                  ) : null}
                                  {timingOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {formatPowerTimingOptionLabel(option)}
                                    </option>
                                  ))}
                                </select>
                                {requiresAttachedHostileEntryBeforeTiming ? (
                                  <p className="mt-1 text-[11px] text-amber-300">
                                    Choose Attached Payload Gate before authoring Packet 1 timing.
                                  </p>
                                ) : null}
                              </label>
                              <label className="block">
                                <span className="text-xs text-zinc-400">Duration</span>
                                <select
                                  value={packet.effectDurationType ?? "INSTANT"}
                                  onChange={(event) =>
                                    updatePowerPacket(powerIndex, packetIndex, {
                                      effectDurationType: event.target.value as EffectDurationType,
                                    })
                                  }
                                  disabled={!canEdit || saving}
                                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                >
                                  {durationOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {POWER_EFFECT_DURATION_LABELS[option]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {packet.effectDurationType === "TURNS" ? (
                                <label className="block">
                                  <span className="text-xs text-zinc-400">Duration Turns</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={CHARACTER_POWER_MAX_PACKET_DURATION_TURNS}
                                    step={1}
                                    value={packet.effectDurationTurns ?? 1}
                                    onChange={(event) =>
                                      updatePowerPacket(powerIndex, packetIndex, {
                                        effectDurationTurns: Number(event.target.value),
                                      })
                                    }
                                    disabled={!canEdit || saving}
                                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                  />
                                </label>
                              ) : null}
                              {packetIndex > 0 ? (
                                <label className="block">
                                  <span className="text-xs text-zinc-400">Dependency</span>
                                  <select
                                    value={packet.secondaryDependencyMode ?? "LINKED_TO_PRIMARY"}
                                    onChange={(event) =>
                                      updatePowerPacket(powerIndex, packetIndex, {
                                        secondaryDependencyMode: event.target.value as SecondaryDependencyMode,
                                      })
                                    }
                                    disabled={!canEdit || saving}
                                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                  >
                                    {SECONDARY_DEPENDENCY_MODE_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {SECONDARY_DEPENDENCY_MODE_LABELS[option]}
                                      </option>
                                    ))}
                                  </select>
                                  <p className="mt-1 text-[11px] text-zinc-500">
                                    Independent can join same-timing bundles; linked/dependent/triggered packets remain outside that bundle.
                                  </p>
                                </label>
                              ) : null}
                            </div>

                            <div className="mt-3 rounded-lg border border-zinc-900 bg-zinc-950/60 p-3">
                              <div className="text-xs uppercase text-zinc-500">Packet Specifics</div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                {packetIndex > 0 ? (
                                  <label className="block">
                                    <span className="text-xs text-zinc-400">Apply To</span>
                                    <select
                                      value={packet.applyTo ?? "PRIMARY_TARGET"}
                                      onChange={(event) =>
                                        updatePowerPacket(powerIndex, packetIndex, {
                                          applyTo: event.target.value as EffectPacketApplyTo,
                                        })
                                      }
                                      disabled={!canEdit || saving}
                                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                    >
                                      {applyToOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {POWER_APPLY_TO_LABELS[option]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ) : (
                                  <label className="block">
                                    <span className="text-xs text-zinc-400">Defence Check</span>
                                    <input
                                      value={getCharacterPowerPrimaryDefenceLabel(power)}
                                      readOnly
                                      disabled
                                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-200 disabled:opacity-100"
                                    />
                                  </label>
                                )}

                                {packet.intention === "DEFENCE" ? (
                                  <>
                                    <label className="block">
                                      <span className="text-xs text-zinc-400">Defence Type</span>
                                      <select
                                        value={defenceMode}
                                        onChange={(event) =>
                                          updatePowerPacketDetails(powerIndex, packetIndex, {
                                            defenceMode: event.target.value,
                                            ...(event.target.value === "Resist"
                                              ? { resistedAttribute }
                                              : { resistedAttribute: null }),
                                          })
                                        }
                                        disabled={!canEdit || saving}
                                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                      >
                                        {CHARACTER_POWER_DEFENCE_MODES.map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </label>
                                    {defenceMode === "Block" ? (
                                      <label className="block">
                                        <span className="text-xs text-zinc-400">Protection Channel</span>
                                        <select
                                          value={attackMode}
                                          onChange={(event) =>
                                            updatePowerPacketDetails(powerIndex, packetIndex, {
                                              attackMode: event.target.value,
                                            })
                                          }
                                          disabled={!canEdit || saving}
                                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                        >
                                          {CHARACTER_POWER_ATTACK_MODES.map((option) => (
                                            <option key={option} value={option}>{POWER_ATTACK_MODE_LABELS[option]}</option>
                                          ))}
                                        </select>
                                      </label>
                                    ) : null}
                                    {defenceMode === "Resist" ? (
                                      <label className="block">
                                        <span className="text-xs text-zinc-400">Resisted Attribute</span>
                                        <select
                                          value={resistedAttribute}
                                          onChange={(event) =>
                                            updatePowerPacketDetails(powerIndex, packetIndex, {
                                              resistedAttribute: event.target.value,
                                            })
                                          }
                                          disabled={!canEdit || saving}
                                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                        >
                                          {CHARACTER_POWER_DEFENCE_RESISTED_ATTRIBUTES.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                          ))}
                                        </select>
                                      </label>
                                    ) : null}
                                  </>
                                ) : null}

                                {packet.intention === "ATTACK" ? (
                                  <label className="block">
                                    <span className="text-xs text-zinc-400">Mode</span>
                                    <select
                                      value={attackMode}
                                      onChange={(event) =>
                                        updatePowerPacketDetails(powerIndex, packetIndex, {
                                          attackMode: event.target.value,
                                          damageTypes: [],
                                        })
                                      }
                                      disabled={!canEdit || saving}
                                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                    >
                                      {CHARACTER_POWER_ATTACK_MODES.map((option) => (
                                        <option key={option} value={option}>{POWER_ATTACK_MODE_LABELS[option]}</option>
                                      ))}
                                    </select>
                                  </label>
                                ) : null}

                                {packet.intention === "ATTACK" ? (
                                  <div className="md:col-span-2">
                                    <div className="text-xs text-zinc-400">Damage Types</div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {damageTypeOptions.map((damageType) => {
                                        const selected = selectedDamageTypes.some(
                                          (entry) => entry.toLowerCase() === damageType.name.toLowerCase(),
                                        );
                                        const disabled =
                                          !canEdit ||
                                          saving ||
                                          (!selected && selectedDamageTypes.length >= CHARACTER_POWER_MAX_DAMAGE_TYPES);
                                        return (
                                          <button
                                            key={damageType.id}
                                            type="button"
                                            onClick={() =>
                                              updatePowerPacketDetails(powerIndex, packetIndex, {
                                                damageTypes: toggleStringValue(selectedDamageTypes, damageType.name),
                                              })
                                            }
                                            disabled={disabled}
                                            className={[
                                              "rounded border px-2 py-1 text-xs",
                                              selected
                                                ? "border-emerald-600 bg-emerald-950/40 text-emerald-100"
                                                : "border-zinc-700 text-zinc-200 hover:bg-zinc-900",
                                              disabled ? "cursor-not-allowed opacity-60" : "",
                                            ].join(" ")}
                                          >
                                            {damageType.name}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <p className="mt-1 text-[11px] text-zinc-500">
                                      Filtered by mode. Select up to {CHARACTER_POWER_MAX_DAMAGE_TYPES}.
                                    </p>
                                  </div>
                                ) : null}

                                {packet.effectTimingType === "ON_TRIGGER" &&
                                !(descriptorChassis === "TRIGGER" && packetIndex === 0) ? (
                                  <label className="block">
                                    <span className="text-xs text-zinc-400">Trigger Condition</span>
                                    <select
                                      value={packet.triggerConditionText ?? ""}
                                      onChange={(event) =>
                                        updatePowerPacket(powerIndex, packetIndex, {
                                          triggerConditionText: event.target.value || null,
                                        })
                                      }
                                      disabled={!canEdit || saving}
                                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                    >
                                      <option value="">Choose...</option>
                                      {triggerConditionOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {POWER_TRIGGER_CONDITION_LABELS[option]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ) : null}

                                {packet.intention === "CONTROL" ? (
                                  <>
                                    <label className="block">
                                      <span className="text-xs text-zinc-400">Control Mode</span>
                                      <select
                                        value={String(packetDetails.controlMode ?? "Force move")}
                                        onChange={(event) =>
                                          updatePowerPacketDetails(powerIndex, packetIndex, {
                                            controlMode: event.target.value,
                                          })
                                        }
                                        disabled={!canEdit || saving}
                                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                      >
                                        {CHARACTER_POWER_CONTROL_MODES.map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="block">
                                      <span className="text-xs text-zinc-400">Control Theme</span>
                                      <select
                                        value={String(packetDetails.controlTheme ?? "")}
                                        onChange={(event) =>
                                          updatePowerPacketDetails(powerIndex, packetIndex, {
                                            controlTheme: event.target.value || null,
                                          })
                                        }
                                        disabled={!canEdit || saving}
                                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                      >
                                        <option value="">Select...</option>
                                        {CHARACTER_POWER_CONTROL_THEME_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </>
                                ) : null}

                                {packet.intention === "CLEANSE" ? (
                                  <>
                                    <label className="block">
                                      <span className="text-xs text-zinc-400">Cleanse Effect</span>
                                      <select
                                        value={String(packetDetails.cleanseEffectType ?? "Active Power")}
                                        onChange={(event) =>
                                          updatePowerPacketDetails(powerIndex, packetIndex, {
                                            cleanseEffectType: event.target.value,
                                          })
                                        }
                                        disabled={!canEdit || saving}
                                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                      >
                                        {CHARACTER_POWER_CLEANSE_EFFECTS.map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="block">
                                      <span className="text-xs text-zinc-400">Cleanse Theme</span>
                                      <select
                                        value={String(packetDetails.cleanseTheme ?? "")}
                                        onChange={(event) =>
                                          updatePowerPacketDetails(powerIndex, packetIndex, {
                                            cleanseTheme: event.target.value || null,
                                          })
                                        }
                                        disabled={!canEdit || saving}
                                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                      >
                                        <option value="">Select...</option>
                                        {CHARACTER_POWER_CONTROL_THEME_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </>
                                ) : null}

                                {packet.intention === "MOVEMENT" ? (
                                  <>
                                    <label className="block">
                                      <span className="text-xs text-zinc-400">Movement Type</span>
                                      <select
                                        value={String(packetDetails.movementMode ?? "Force Push")}
                                        onChange={(event) =>
                                          updatePowerPacketDetails(powerIndex, packetIndex, {
                                            movementMode: event.target.value,
                                          })
                                        }
                                        disabled={!canEdit || saving}
                                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                      >
                                        {CHARACTER_POWER_MOVEMENT_MODES.map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="block">
                                      <span className="text-xs text-zinc-400">Movement Theme</span>
                                      <select
                                        value={String(packetDetails.movementTheme ?? "")}
                                        onChange={(event) =>
                                          updatePowerPacketDetails(powerIndex, packetIndex, {
                                            movementTheme: event.target.value || null,
                                          })
                                        }
                                        disabled={!canEdit || saving}
                                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                      >
                                        <option value="">Select...</option>
                                        {CHARACTER_POWER_CONTROL_THEME_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </>
                                ) : null}

                                {(packet.intention === "AUGMENT" || packet.intention === "DEBUFF") ? (
                                  <label className="block">
                                    <span className="text-xs text-zinc-400">
                                      {packet.intention === "AUGMENT" ? "Augment Stat" : "Debuff Stat"}
                                    </span>
                                    <select
                                      value={String(packetDetails.statTarget ?? "Attack")}
                                      onChange={(event) =>
                                        updatePowerPacketDetails(powerIndex, packetIndex, {
                                          statTarget: event.target.value,
                                        })
                                      }
                                      disabled={!canEdit || saving}
                                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                    >
                                      {CHARACTER_POWER_ATTRIBUTE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                      ))}
                                    </select>
                                  </label>
                                ) : null}

                                {packet.intention === "HEALING" ? (
                                  <label className="block">
                                    <span className="text-xs text-zinc-400">Healing Mode</span>
                                    <select
                                      value={String(packetDetails.healingMode ?? "PHYSICAL")}
                                      onChange={(event) =>
                                        updatePowerPacketDetails(powerIndex, packetIndex, {
                                          healingMode: event.target.value,
                                        })
                                      }
                                      disabled={!canEdit || saving}
                                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                    >
                                      {CHARACTER_POWER_ATTACK_MODES.map((option) => (
                                        <option key={option} value={option}>{POWER_ATTACK_MODE_LABELS[option]}</option>
                                      ))}
                                    </select>
                                  </label>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <label className="block">
                        <span className="text-xs text-zinc-400">Range</span>
                        <select
                          value={displayedRangeCategory}
                          onChange={(event) =>
                            updatePowerPacketDetails(powerIndex, 0, {
                              ...createCharacterPowerRangeDetails(event.target.value as CharacterPowerRangeCategory),
                            })
                          }
                          disabled={!canEdit || saving}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                        >
                          {rangeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      {displayedRangeCategory !== "SELF" ? (
                        <label className="block">
                          <span className="text-xs text-zinc-400">
                            {displayedRangeCategory === "MELEE"
                              ? "Targets"
                              : displayedRangeCategory === "RANGED"
                                ? "Feet"
                                : "Cast Range"}
                          </span>
                          <select
                            value={Number(primaryDetails.rangeValue ?? 1)}
                            onChange={(event) =>
                              updatePowerPacketDetails(powerIndex, 0, {
                                rangeValue: Number(event.target.value),
                              })
                            }
                            disabled={!canEdit || saving}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                          >
                            {(displayedRangeCategory === "MELEE"
                              ? CHARACTER_POWER_RANGE_TARGET_OPTIONS
                              : displayedRangeCategory === "RANGED"
                                ? CHARACTER_POWER_RANGE_RANGED_DISTANCE_OPTIONS
                                : CHARACTER_POWER_RANGE_AOE_CENTER_RANGE_OPTIONS
                            ).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {displayedRangeCategory === "RANGED" ? (
                        <label className="block">
                          <span className="text-xs text-zinc-400">Targets</span>
                          <select
                            value={Number(rangeExtra.targets ?? 1)}
                            onChange={(event) =>
                              updatePowerPacketDetails(powerIndex, 0, {
                                rangeExtra: { ...rangeExtra, targets: Number(event.target.value) },
                              })
                            }
                            disabled={!canEdit || saving}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                          >
                            {CHARACTER_POWER_RANGE_TARGET_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {displayedRangeCategory === "AOE" ? (
                        <label className="block">
                          <span className="text-xs text-zinc-400">Area Count</span>
                          <select
                            value={Number(rangeExtra.count ?? 1)}
                            onChange={(event) =>
                              updatePowerPacketDetails(powerIndex, 0, {
                                rangeExtra: { ...rangeExtra, count: Number(event.target.value) },
                              })
                            }
                            disabled={!canEdit || saving}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                          >
                            {CHARACTER_POWER_RANGE_TARGET_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {displayedRangeCategory === "AOE" ? (
                        <>
                          <label className="block">
                            <span className="text-xs text-zinc-400">Area Shape</span>
                            <select
                              value={String(rangeExtra.shape ?? "SPHERE")}
                              onChange={(event) =>
                                updatePowerPacketDetails(powerIndex, 0, {
                                  rangeExtra: { ...rangeExtra, shape: event.target.value },
                                })
                              }
                              disabled={!canEdit || saving}
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                            >
                              {CHARACTER_POWER_RANGE_AOE_SHAPES.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          {String(rangeExtra.shape ?? "SPHERE") === "SPHERE" ? (
                            <label className="block">
                              <span className="text-xs text-zinc-400">Sphere Radius</span>
                              <select
                                value={Number(rangeExtra.sphereRadiusFeet ?? 10)}
                                onChange={(event) =>
                                  updatePowerPacketDetails(powerIndex, 0, {
                                    rangeExtra: { ...rangeExtra, sphereRadiusFeet: Number(event.target.value) },
                                  })
                                }
                                disabled={!canEdit || saving}
                                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                              >
                                {CHARACTER_POWER_RANGE_AOE_SPHERE_RADIUS_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {String(rangeExtra.shape ?? "SPHERE") === "CONE" ? (
                            <label className="block">
                              <span className="text-xs text-zinc-400">Cone Length</span>
                              <select
                                value={Number(rangeExtra.coneLengthFeet ?? 15)}
                                onChange={(event) =>
                                  updatePowerPacketDetails(powerIndex, 0, {
                                    rangeExtra: { ...rangeExtra, coneLengthFeet: Number(event.target.value) },
                                  })
                                }
                                disabled={!canEdit || saving}
                                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                              >
                                {CHARACTER_POWER_RANGE_AOE_CONE_LENGTH_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {String(rangeExtra.shape ?? "SPHERE") === "LINE" ? (
                            <>
                              <label className="block">
                                <span className="text-xs text-zinc-400">Line Width</span>
                                <select
                                  value={Number(rangeExtra.lineWidthFeet ?? 5)}
                                  onChange={(event) =>
                                    updatePowerPacketDetails(powerIndex, 0, {
                                      rangeExtra: { ...rangeExtra, lineWidthFeet: Number(event.target.value) },
                                    })
                                  }
                                  disabled={!canEdit || saving}
                                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                >
                                  {CHARACTER_POWER_RANGE_AOE_LINE_WIDTH_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block">
                                <span className="text-xs text-zinc-400">Line Length</span>
                                <select
                                  value={Number(rangeExtra.lineLengthFeet ?? 30)}
                                  onChange={(event) =>
                                    updatePowerPacketDetails(powerIndex, 0, {
                                      rangeExtra: { ...rangeExtra, lineLengthFeet: Number(event.target.value) },
                                    })
                                  }
                                  disabled={!canEdit || saving}
                                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                                >
                                  {CHARACTER_POWER_RANGE_AOE_LINE_LENGTH_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </div>

                    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="text-xs uppercase text-zinc-500">Descriptor</div>
                      {summary?.descriptorLines.length ? (
                        <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                          {summary.descriptorLines.map((line, index) => (
                            <li key={`${powerIndex}-descriptor-${index}`}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500">No descriptor output yet.</p>
                      )}
                      {summary?.errors.length ? (
                      <ul
                        className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300"
                        data-testid="character-power-errors"
                      >
                          {summary.errors.map((powerError) => (
                            <li key={powerError}>{powerError}</li>
                          ))}
                        </ul>
                      ) : null}
                      {summary?.warnings.length ? (
                        <ul className="mt-3 space-y-2 text-sm">
                          {summary.warnings.map((powerWarning) => (
                            <li
                              key={powerWarning}
                              className={`rounded border px-3 py-2 ${warningCalloutClass(powerWarning)}`}
                            >
                              {powerWarning}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
      </div>
    );
  }  function updateGreatSecretField(index: number, value: string) {
    const fields = [...builderData.greatSecret.fields];
    fields[index] = value;
    updateBuilderData({
      greatSecret: {
        ...builderData.greatSecret,
        fields,
      },
    });
  }

  function addCharacteristic() {
    updateBuilderData({
      characteristics: [
        ...builderData.characteristics,
        {
          id: `characteristic-${Date.now()}`,
          name: "",
          keyword: "",
          additionalDice: 1,
          resultModifier: undefined,
          rerollOnes: undefined,
          attributeSwaps: [],
        },
      ],
    });
  }

  function updateCharacteristic(characteristicId: string, patch: Partial<CharacteristicState>) {
    updateBuilderData({
      characteristics: builderData.characteristics.map((characteristic) =>
        characteristic.id === characteristicId
          ? {
              ...characteristic,
              ...patch,
            }
          : characteristic,
      ),
    });
  }

  function removeCharacteristic(characteristicId: string) {
    updateBuilderData({
      characteristics: builderData.characteristics.filter(
        (characteristic) => characteristic.id !== characteristicId,
      ),
    });
    setAttributeSwapDrafts((current) => {
      const next = { ...current };
      delete next[characteristicId];
      return next;
    });
  }

  function addAttributeSwap(characteristic: CharacteristicState) {
    const selected = attributeSwapDrafts[characteristic.id] as CharacterAttribute | undefined;
    if (
      !selected ||
      !CHARACTER_ATTRIBUTES.includes(selected) ||
      characteristic.attributeSwaps.includes(selected) ||
      !getCanAddAttributeSwapForBudget(characteristic, getCharacteristicGlobalBudget(characteristic))
    ) {
      return;
    }
    updateCharacteristic(characteristic.id, {
      attributeSwaps: [...characteristic.attributeSwaps, selected],
    });
    setAttributeSwapDrafts((current) => ({
      ...current,
      [characteristic.id]: "",
    }));
  }

  function removeAttributeSwap(characteristic: CharacteristicState, attribute: CharacterAttribute) {
    updateCharacteristic(characteristic.id, {
      attributeSwaps: characteristic.attributeSwaps.filter((swap) => swap !== attribute),
    });
  }

  function updateAttributeMethod(method: AttributeMethod) {
    updateBuilderData({
      attributeMethod: method,
      attributes: method === "HEROIC" ? { ...builderData.attributes } : builderData.attributes,
    });
  }

  function updateAttribute(attribute: CharacterAttribute, value: CharacterAttributeValue) {
    updateBuilderData({
      attributes: {
        ...builderData.attributes,
        [attribute]: value,
      },
    });
  }

  function getCharacteristicGlobalBudget(characteristic: CharacteristicState) {
    const currentCost = characteristicCost(characteristic);
    return Math.max(0, characteristicBudget - (characteristicSpent - currentCost));
  }

  function updateResistPoint(attribute: CharacterAttribute, value: string) {
    const digits = normalizeWholeNumberInput(value);
    const requested = Number.parseInt(digits || "0", 10) || 0;
    const current = builderData.resistPoints[attribute] ?? 0;
    const remainingWithoutCurrent = Math.max(0, resistBudget - (resistSpent - current));
    const numeric = Math.min(requested, remainingWithoutCurrent);
    updateBuilderData({
      resistPoints: {
        ...builderData.resistPoints,
        [attribute]: numeric,
      },
    });
  }

  function isHeroicValueAvailable(attribute: CharacterAttribute, value: number) {
    if (builderData.attributeMethod !== "HEROIC") return true;
    const required = heroicRequiredCounts();
    const used = CHARACTER_ATTRIBUTES.reduce<Map<number, number>>((counts, candidate) => {
      if (candidate === attribute) return counts;
      const candidateValue = builderData.attributes[candidate];
      if (candidateValue === "") return counts;
      counts.set(candidateValue, (counts.get(candidateValue) ?? 0) + 1);
      return counts;
    }, new Map());
    return (used.get(value) ?? 0) < (required.get(value) ?? 0);
  }

  function toggleTrait(trait: PlayerTraitDefinition) {
    if (trait.isActive === false) return;
    const selected = new Set(builderData.selectedTraitKeys);
    if (selected.has(trait.id)) {
      selected.delete(trait.id);
    } else {
      const negativeSelectedCount = activeTraitCatalog.filter(
        (candidate) =>
          candidate.classification === "NEGATIVE" &&
          selected.has(candidate.id),
      ).length;
      if (trait.classification === "NEGATIVE" && negativeSelectedCount >= 2) {
        return;
      }
      selected.add(trait.id);
    }
    updateBuilderData({ selectedTraitKeys: Array.from(selected) });
  }

  function updateEquipmentSlot(slot: EquipmentSlotKey, backpackItemId: string) {
    const next = {
      ...builderData.equippedSlots,
      [slot]: backpackItemId || undefined,
    };
    if (!backpackItemId) {
      delete next[slot];
    }
    const selectedItem = backpackItems.find((item) => item.id === backpackItemId);
    if (
      slot === "mainHand" &&
      selectedItem?.itemTemplate.type === "WEAPON" &&
      selectedItem.itemTemplate.size === "TWO_HANDED"
    ) {
      delete next.offHand;
    }
    updateBuilderData({ equippedSlots: next });
  }

  function getLegalBackpackItemsForSlot(slot: EquipmentSlotKey) {
    const currentBackpackItemId = builderData.equippedSlots[slot];
    const useCounts = getEquipmentSlotUseCounts(builderData.equippedSlots);
    return backpackItems.filter((item) => {
      if (!isBackpackItemLegalForEquipmentSlot(slot, item)) return false;
      if (slot === "offHand" && isOffHandLocked && currentBackpackItemId !== item.id) {
        return false;
      }
      const usedByOtherSlots =
        (useCounts.get(item.id) ?? 0) - (currentBackpackItemId === item.id ? 1 : 0);
      return usedByOtherSlots < item.quantity || currentBackpackItemId === item.id;
    });
  }

  function getShortcutLegalSlots(item: BuilderBackpackItem): EquipmentSlotKey[] {
    return EQUIPMENT_SLOTS.filter((slot) =>
      getLegalBackpackItemsForSlot(slot).some((candidate) => candidate.id === item.id),
    );
  }

  function equipBackpackItemToSlot(item: BuilderBackpackItem, slot: EquipmentSlotKey) {
    setError(null);
    setPendingHandEquipItemId("");
    setSelectedBackpackItemId(item.id);
    updateEquipmentSlot(slot, item.id);
  }

  function handleEquipBackpackItem(item: BuilderBackpackItem) {
    if (!canEdit || saving) return;
    const legalSlots = getShortcutLegalSlots(item);
    if (legalSlots.length === 0) {
      setError("No legal equipment slot is currently available for this item.");
      return;
    }

    const targetSlot = legalSlots[0];
    const isOneHandedHandItem =
      (item.itemTemplate.type === "WEAPON" || item.itemTemplate.type === "SHIELD") &&
      item.itemTemplate.size === "ONE_HANDED";
    const handChoices = legalSlots.filter((slot) => slot === "mainHand" || slot === "offHand");

    if (isOneHandedHandItem && handChoices.length > 1) {
      setError(null);
      setSelectedBackpackItemId(item.id);
      setPendingHandEquipItemId(item.id);
      return;
    }

    equipBackpackItemToSlot(item, targetSlot);
  }

  function handleUnequipBackpackItem(item: BuilderBackpackItem) {
    if (!canEdit || saving) return;
    const next = { ...builderData.equippedSlots };
    for (const slot of EQUIPMENT_SLOTS) {
      if (next[slot] === item.id) {
        delete next[slot];
      }
    }
    setSelectedBackpackItemId(item.id);
    updateBuilderData({ equippedSlots: next });
  }

  function getTransferableBackpackQuantity(item: BuilderBackpackItem) {
    const usedCount = equippedUseCounts.get(item.id) ?? 0;
    return Math.max(0, item.quantity - usedCount);
  }

  function openBackpackTransfer(item: BuilderBackpackItem) {
    if (!canEdit || saving || transferringBackpackItem) return;
    const targetCharacterId = transferTargets[0]?.characterId ?? "";
    if (!targetCharacterId) {
      setError("No active recipient characters are available.");
      return;
    }
    if (getTransferableBackpackQuantity(item) <= 0) {
      setError("Unequip this item before transferring the equipped quantity.");
      return;
    }
    setError(null);
    setMessage(null);
    setSelectedBackpackItemId(item.id);
    setTransferDraft({
      backpackItemId: item.id,
      targetCharacterId,
      quantity: "1",
    });
  }

  async function reloadBackpackAfterTransfer() {
    if (!builderApiUrl) return;
    const res = await fetch(builderApiUrl, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as BuilderPayload;
    if (!res.ok) {
      throw new Error(data.error ?? "Item transferred, but Backpack refresh failed.");
    }
    setPayload((current) =>
      current
        ? {
            ...current,
            backpackItems: data.backpackItems ?? current.backpackItems,
            transferTargets: data.transferTargets ?? current.transferTargets,
          }
        : data,
    );
  }

  async function syncDraftBeforeBackpackTransfer() {
    if (!builderApiUrl || !draft || !canEdit) {
      throw new Error("Character Builder is not ready to sync equipment.");
    }
    if (!hasUnsavedEquipmentChanges) return;
    if (blockingSaveErrors.length > 0) {
      throw new Error(`Resolve blocking Character Builder validation errors before giving items: ${blockingSaveErrors.join(" ")}`);
    }

    const res = await fetch(builderApiUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: draft.name,
        imageUrl: draft.imageUrl,
        age: draft.age,
        race: draft.race,
        description: draft.description,
        level: Number(draft.level),
        builderData: draft.builderData,
      }),
    });
      const data = (await res.json().catch(() => ({}))) as {
        character?: CharacterBuilderRecord;
        traitCatalog?: PlayerTraitDefinition[];
        backpackItems?: BuilderBackpackItem[];
        powerTuning?: PowerTuningSnapshot;
        characterBuilderTuning?: CharacterBuilderTuningSnapshot;
        error?: string;
      };
    if (!res.ok || !data.character) {
      throw new Error(data.error ?? (await readApiError(res, "Failed to sync equipment.")));
    }
    const savedCharacter = data.character;

    setPayload((current) =>
      current
        ? {
            ...current,
            character: savedCharacter,
            traitCatalog: data.traitCatalog ?? current.traitCatalog,
            backpackItems: data.backpackItems ?? current.backpackItems,
            powerTuning: data.powerTuning ?? current.powerTuning,
            characterBuilderTuning: data.characterBuilderTuning ?? current.characterBuilderTuning,
          }
        : current,
    );
    setDraft(makeDraft(savedCharacter));
  }

  async function handleBackpackTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!builderApiUrl || !transferDraft || !transferBackpackItem) return;
    const quantity = Number(transferDraft.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Transfer quantity must be a positive whole number.");
      return;
    }
    if (quantity > getTransferableBackpackQuantity(transferBackpackItem)) {
      setError("Transfer quantity exceeds unequipped Backpack quantity.");
      return;
    }

    setTransferringBackpackItem(true);
    setError(null);
    setMessage(null);
    try {
      await syncDraftBeforeBackpackTransfer();
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(
          characterId,
        )}/backpack-transfer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceBackpackItemId: transferDraft.backpackItemId,
            targetCharacterId: transferDraft.targetCharacterId,
            quantity,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? (await readApiError(res, "Failed to transfer item.")));
      }
      await reloadBackpackAfterTransfer();
      setTransferDraft(null);
      setMessage("Item transferred.");
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Failed to transfer item.");
    } finally {
      setTransferringBackpackItem(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!builderApiUrl || !draft || !canEdit) return;
    if (blockingSaveErrors.length > 0) {
      setError(`Resolve blocking Character Builder validation errors before saving: ${blockingSaveErrors.join(" ")}`);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(builderApiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: draft.name,
          imageUrl: draft.imageUrl,
          age: draft.age,
          race: draft.race,
          description: draft.description,
          level: Number(draft.level),
          builderData: draft.builderData,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        character?: CharacterBuilderRecord;
        traitCatalog?: PlayerTraitDefinition[];
        powerTuning?: PowerTuningSnapshot;
        characterBuilderTuning?: CharacterBuilderTuningSnapshot;
        error?: string;
      };
      if (!res.ok || !data.character) {
        throw new Error(data.error ?? (await readApiError(res, "Failed to save character.")));
      }

      const savedCharacter = data.character;
      setPayload((current) =>
        current
          ? {
              ...current,
              character: savedCharacter,
              traitCatalog: data.traitCatalog ?? current.traitCatalog,
              powerTuning: data.powerTuning ?? current.powerTuning,
              characterBuilderTuning: data.characterBuilderTuning ?? current.characterBuilderTuning,
            }
          : current,
      );
      setDraft(makeDraft(savedCharacter));
      setMessage("Character details saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save character.");
    } finally {
      setSaving(false);
    }
  }

  const editorPanel = (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="sticky top-3 z-30 rounded-xl border border-zinc-800 bg-black/95 p-3 shadow-lg shadow-black/30 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-200">Character Builder</div>
            <div className="text-xs text-zinc-500">
              Save applies Character Details, Narrative Details, Characteristics,
              Attributes, Resist Points, Traits, Signature Move, and Powers.
            </div>
          </div>
          <button
            type="submit"
            disabled={!canSave}
            title={blockingSaveErrors.length > 0 ? blockingSaveErrors.join(" ") : undefined}
            data-testid="save-character-button"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Character"}
          </button>
        </div>
        {blockingSaveErrors.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
            {blockingSaveErrors.map((validationError) => (
              <li key={validationError}>{validationError}</li>
            ))}
          </ul>
        ) : null}
        {!canEdit ? (
          <span className="mt-2 block text-sm text-zinc-500">
            This character is not editable from your account.
          </span>
        ) : null}
      </div>

      <details open className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <summary className="cursor-pointer">
          <div>
            <h2 className="text-lg font-semibold">Character Details</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Basic identity only. Character mechanics arrive in later steps.
            </p>
          </div>
        </summary>

        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="text-xs text-zinc-400">Character Name</span>
            <input
              type="text"
              value={draft?.name ?? ""}
              onChange={(event) => updateDraft({ name: event.target.value })}
              disabled={!canEdit || saving}
              placeholder="UNNAMED"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="text-xs text-zinc-400">Portrait URL</span>
            <input
              type="url"
              value={draft?.imageUrl ?? ""}
              onChange={(event) => updateDraft({ imageUrl: event.target.value })}
              disabled={!canEdit || saving}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-zinc-400">Level</span>
              <input
                type="number"
                min={1}
                step={1}
                value={draft?.level ?? "1"}
                onChange={(event) => updateDraft({ level: event.target.value })}
                disabled={!canEdit || saving}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-400">Age</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft?.age ?? ""}
                onBeforeInput={(event) => {
                  if (event.data && /\D/.test(event.data)) {
                    event.preventDefault();
                  }
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (/\D/.test(text)) {
                    event.preventDefault();
                    updateDraft({ age: normalizeAgeInput(text) });
                  }
                }}
                onChange={(event) => updateDraft({ age: normalizeAgeInput(event.target.value) })}
                disabled={!canEdit || saving}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-400">Race</span>
              <input
                type="text"
                value={draft?.race ?? ""}
                onChange={(event) => updateDraft({ race: event.target.value })}
                disabled={!canEdit || saving}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-zinc-400">Description / Backstory</span>
            <textarea
              value={draft?.description ?? ""}
              onChange={(event) => updateDraft({ description: event.target.value })}
              disabled={!canEdit || saving}
              rows={6}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            />
          </label>
        </div>

      </details>

      <details
        className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
        data-testid="character-builder-section-narrative"
      >
        <summary className="cursor-pointer">
          <h2 className="text-lg font-semibold">Narrative Details</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Great Secret and narrative notes. Bonds remain Game Director-assigned later.
          </p>
        </summary>
        <div className="mt-4 grid gap-4" data-testid="character-builder-section-narrative-body">
          <label className="block">
            <span className="text-xs text-zinc-400">Great Secret Template</span>
            <select
              value={builderData.greatSecret.templateKey}
              onChange={(event) => {
                const template = GREAT_SECRET_TEMPLATES.find(
                  (candidate) => candidate.key === event.target.value,
                ) ?? GREAT_SECRET_TEMPLATES[0];
                updateBuilderData({
                  greatSecret: {
                    templateKey: template.key,
                    fields: template.fieldLabels.map(
                      (_, index) => builderData.greatSecret.fields[index] ?? "",
                    ),
                  },
                });
              }}
              disabled={!canEdit || saving}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            >
              {GREAT_SECRET_TEMPLATES.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          {(
            GREAT_SECRET_TEMPLATES.find(
              (template) => template.key === builderData.greatSecret.templateKey,
            ) ?? GREAT_SECRET_TEMPLATES[0]
          ).fieldLabels.map((label, index) => (
            <label key={label} className="block">
              <span className="text-xs text-zinc-400">{label}</span>
              <input
                type="text"
                value={builderData.greatSecret.fields[index] ?? ""}
                onChange={(event) => updateGreatSecretField(index, event.target.value)}
                disabled={!canEdit || saving}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              />
            </label>
          ))}
          <div className="rounded-lg border border-zinc-800 bg-black p-3 text-sm text-zinc-300">
            {renderGreatSecret(builderData.greatSecret)}
          </div>
          <label className="block">
            <span className="text-xs text-zinc-400">Narrative Notes</span>
            <textarea
              value={builderData.narrativeNotes}
              onChange={(event) => updateBuilderData({ narrativeNotes: event.target.value })}
              disabled={!canEdit || saving}
              rows={4}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            />
          </label>
          <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
            Bonds are assigned by the Game Director in a later Character Management step.
          </div>
        </div>
      </details>

      <details
        className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
        data-testid="character-builder-section-traits"
      >
        <summary className="cursor-pointer">
          <h2 className="text-lg font-semibold">Player Traits</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Trait Points: {traitSummary.positiveCost}/{traitSummary.available} spent
            ({traitPointBudget(currentLevel)} base + {traitSummary.negativeBonusAllowed} allowed negative bonus).
          </p>
        </summary>
        <div className="mt-4 space-y-5">
          {activeTraitCatalog.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No active Character Traits are available yet.
            </p>
          ) : null}
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium text-zinc-200">Positive Traits</h3>
              <span className="text-xs text-zinc-500">These cost Trait Points.</span>
            </div>
            <div className="mt-2 space-y-2">
              {positiveTraits.length === 0 ? (
                <p className="text-sm text-zinc-500">No active Positive Traits.</p>
              ) : null}
              {positiveTraits.map((trait) => {
                const selected = builderData.selectedTraitKeys.includes(trait.id);
                return (
                  <label
                    key={trait.id}
                    className="flex w-full gap-3 rounded-lg border border-zinc-800 bg-black px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleTrait(trait)}
                      disabled={!canEdit || saving}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-200">
                        {trait.name} ({signedTraitPointDisplay(trait)})
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {trait.descriptor}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h3 className="font-medium text-zinc-200">Negative Traits</h3>
              <span className="text-xs text-zinc-500">
                These grant bonus Trait Points, up to 2 total bonus points and 2 Negative Traits.
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {visibleNegativeTraits.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  {selectedNegativeTraitCount >= 2
                    ? "Negative Trait cap reached."
                    : "No active Negative Traits."}
                </p>
              ) : null}
              {visibleNegativeTraits.map((trait) => {
                const selected = builderData.selectedTraitKeys.includes(trait.id);
                return (
                  <label
                    key={trait.id}
                    className="flex w-full gap-3 rounded-lg border border-zinc-800 bg-black px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleTrait(trait)}
                      disabled={!canEdit || saving}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-200">
                        {trait.name} ({signedTraitPointDisplay(trait)})
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {trait.descriptor}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <summary className="cursor-pointer">
          <div>
            <h2 className="text-lg font-semibold">Characteristics</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Character Points: {characteristicSpent}/{characteristicBudget} spent.
            </p>
          </div>
        </summary>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={addCharacteristic}
            disabled={!canEdit || saving || characteristicSpent >= characteristicBudget}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add Characteristic
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {builderData.characteristics.length === 0 ? (
            <p className="text-sm text-zinc-500">No Characteristics yet.</p>
          ) : null}
          {builderData.characteristics.map((characteristic) => {
            const cost = characteristicCost(characteristic);
            const units = getCharacteristicUnits(characteristic);
            const characteristicErrors = validateCharacteristic(characteristic);
            const characteristicGlobalBudget = getCharacteristicGlobalBudget(characteristic);
            const canAddSwap = getCanAddAttributeSwapForBudget(
              characteristic,
              characteristicGlobalBudget,
            );
            return (
              <div key={characteristic.id} className="rounded-lg border border-zinc-800 bg-black p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs text-zinc-400">Name</span>
                    <input
                      type="text"
                      value={characteristic.name}
                      onChange={(event) =>
                        updateCharacteristic(characteristic.id, { name: event.target.value })
                      }
                      disabled={!canEdit || saving}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Keyword</span>
                    <input
                      type="text"
                      value={characteristic.keyword}
                      onChange={(event) =>
                        updateCharacteristic(characteristic.id, { keyword: event.target.value })
                      }
                      disabled={!canEdit || saving}
                      placeholder="e.g. Gambling"
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                    />
                  </label>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  {[
                    ["additionalDice", "Additional Dice"],
                    ["resultModifier", "Result Modifier"],
                    ["rerollOnes", "Reroll Ones"],
                  ].map(([field, label]) => {
                    const family = field as CharacteristicEffectFamily;
                    const options = getLegalMagnitudeOptionsForBudget(
                      characteristic,
                      family,
                      characteristicGlobalBudget,
                    );
                    return (
                      <label key={field} className="block">
                        <span className="text-xs text-zinc-400">{label}</span>
                        <select
                          value={String(characteristic[family] ?? "")}
                          onChange={(event) =>
                            updateCharacteristic(characteristic.id, {
                              [field]: event.target.value ? Number(event.target.value) : undefined,
                            } as Partial<CharacteristicState>)
                          }
                          disabled={!canEdit || saving}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                        >
                          <option value="">None</option>
                          {options.map((value) => (
                            <option key={value} value={value}>
                              +{value}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                  <div>
                    <span className="text-xs text-zinc-400">Attribute Swap</span>
                    <div className="mt-1 flex gap-2">
                      <select
                        value={attributeSwapDrafts[characteristic.id] ?? ""}
                        onChange={(event) =>
                          setAttributeSwapDrafts((current) => ({
                            ...current,
                            [characteristic.id]: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving || !canAddSwap}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                      >
                        <option value="">Add swap...</option>
                        {CHARACTER_ATTRIBUTES.filter(
                          (attribute) => !characteristic.attributeSwaps.includes(attribute),
                        ).map((attribute) => (
                          <option key={attribute} value={attribute}>
                            {attribute}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => addAttributeSwap(characteristic)}
                        disabled={
                          !canEdit ||
                          saving ||
                          !attributeSwapDrafts[characteristic.id] ||
                          !canAddSwap
                        }
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Add
                      </button>
                    </div>
                    {characteristic.attributeSwaps.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {characteristic.attributeSwaps.map((attribute) => (
                          <button
                            key={attribute}
                            type="button"
                            onClick={() => removeAttributeSwap(characteristic, attribute)}
                            disabled={!canEdit || saving}
                            className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {attribute} x
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div
                    className={
                      units > MAX_CHARACTERISTIC_UNITS ||
                      cost > 15 ||
                      cost > characteristicGlobalBudget
                        ? "text-sm text-red-300"
                        : "text-sm text-zinc-400"
                    }
                  >
                    Cost: {cost}/15 ({units}/{MAX_CHARACTERISTIC_UNITS} units),{" "}
                    {characteristicGlobalBudget} points available for this Characteristic
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCharacteristic(characteristic.id)}
                    disabled={!canEdit || saving}
                    className="rounded-lg border border-red-900 px-3 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-3 text-sm text-zinc-300">
                  {renderCharacteristicDescriptor(characteristic)}
                </p>
                {characteristicErrors.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
                    {characteristicErrors.map((validationError) => (
                      <li key={validationError}>{validationError}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
          {characteristicSpent > characteristicBudget ? (
            <p className="text-sm text-red-300">
              Total Characteristic cost exceeds available Character Points.
            </p>
          ) : null}
        </div>
      </details>

      <details
        className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
        data-testid="character-builder-section-attributes"
      >
        <summary className="cursor-pointer">
          <h2 className="text-lg font-semibold">Attributes / Resist Points</h2>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-black p-3">
            <div className="grid gap-4">
              <div>
                <label className="block">
                  <span className="text-xs text-zinc-400">Attribute Generation Method</span>
                  <select
                    value={builderData.attributeMethod}
                    onChange={(event) => updateAttributeMethod(event.target.value as AttributeMethod)}
                    disabled={!canEdit || saving}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                  >
                    <option value="HEROIC">Heroic</option>
                    <option value="DESTINY">Destiny</option>
                    <option value="ROLLED">Rolled</option>
                  </select>
                </label>
                <p className="mt-2 text-xs text-zinc-500">
                  Heroic uses 12, 10, 8, 8, 6, 4. Destiny must total 48. Rolled allows legal table values.
                </p>
                <div className="mt-4">
                  <div className="grid grid-cols-[minmax(90px,0.8fr)_minmax(92px,120px)_72px] gap-x-2 gap-y-2 xl:grid-cols-[minmax(90px,0.8fr)_minmax(92px,120px)_72px_minmax(450px,1fr)]">
                    <div className="text-xs uppercase text-zinc-500">Attribute</div>
                    <div className="text-center text-xs uppercase text-zinc-500">Base</div>
                    <div className="text-center text-xs uppercase text-zinc-500">Modifier</div>
                    <div className="hidden xl:block" aria-hidden="true" />
                    <div className="hidden xl:block xl:col-start-4 xl:row-span-6 xl:row-start-2 xl:-ml-2">
                      <DerivedSkillRoutingDiagram stats={derivedCombatStats} />
                    </div>
                    {CHARACTER_ATTRIBUTES.map((attribute) => {
                      const modifier = getAttributeModifierValue(attribute);
                      return (
                        <div key={attribute} className="contents">
                          <span className="flex items-center text-sm text-zinc-300">{attribute}</span>
                          <select
                            value={builderData.attributes[attribute]}
                            onChange={(event) =>
                              updateAttribute(
                                attribute,
                                event.target.value ? Number(event.target.value) : "",
                              )
                            }
                            disabled={!canEdit || saving}
                            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-center text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                          >
                            <option value="">Choose...</option>
                            {LEGAL_ATTRIBUTE_VALUES.map((value) => (
                              <option
                                key={value}
                                value={value}
                                disabled={!isHeroicValueAvailable(attribute, value)}
                              >
                                {value}
                              </option>
                            ))}
                          </select>
                          <input
                            readOnly
                            type="text"
                            value={formatSignedModifierValue(modifier)}
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-center text-sm text-zinc-200 opacity-80"
                            aria-label={`${attribute} equipped item modifier`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 xl:hidden">
                    <DerivedSkillValueColumn stats={derivedCombatStats} />
                  </div>
                </div>
                <div className="mt-3 text-sm text-zinc-400">
                  Attribute total:{" "}
                  {CHARACTER_ATTRIBUTES.reduce(
                    (sum, attribute) =>
                      sum +
                      (typeof builderData.attributes[attribute] === "number"
                        ? builderData.attributes[attribute]
                        : 0),
                    0,
                  )}
                  {builderData.attributeMethod === "DESTINY" ? " / 48" : ""}
                </div>
                {builderData.attributeMethod === "DESTINY" ? (
                  <div className="mt-1 text-sm text-zinc-500">
                    Remaining to 48:{" "}
                    {48 -
                      CHARACTER_ATTRIBUTES.reduce(
                        (sum, attribute) =>
                          sum +
                          (typeof builderData.attributes[attribute] === "number"
                            ? builderData.attributes[attribute]
                            : 0),
                        0,
                      )}
                  </div>
                ) : null}
                {attributeValidationErrors.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
                    {attributeValidationErrors.map((validationError) => (
                      <li key={validationError}>{validationError}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-black p-3">
            <h3 className="font-semibold">Resist Points</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Budget: {resistSpent}/{resistBudget}. Add assigned points as dice to Resist rolls.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {CHARACTER_ATTRIBUTES.map((attribute) => (
                <label key={attribute} className="block">
                  <span className="text-xs text-zinc-400">{attribute}</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(
                      0,
                      resistBudget -
                        (resistSpent - (builderData.resistPoints[attribute] ?? 0)),
                    )}
                    step={1}
                    value={builderData.resistPoints[attribute]}
                    onKeyDown={(event) => {
                      if (["e", "E", "+", "-", "."].includes(event.key)) {
                        event.preventDefault();
                      }
                    }}
                    onBeforeInput={(event) => {
                      if (event.data && /\D/.test(event.data)) {
                        event.preventDefault();
                      }
                    }}
                    onPaste={(event) => {
                      const text = event.clipboardData.getData("text");
                      if (/\D/.test(text)) {
                        event.preventDefault();
                        updateResistPoint(attribute, normalizeWholeNumberInput(text));
                      }
                    }}
                    onChange={(event) => updateResistPoint(attribute, event.target.value)}
                    disabled={!canEdit || saving}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                  />
                </label>
              ))}
            </div>
            {resistValidationErrors.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
                {resistValidationErrors.map((validationError) => (
                  <li key={validationError}>{validationError}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </details>

      <details
        className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
        data-testid="character-builder-section-equipment"
      >
        <summary className="cursor-pointer">
          <h2 className="text-lg font-semibold">Equipped Gear / Backpack</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Equip only from this character&apos;s assigned Backpack. A Game Director manages
            Party Inventory and Backpack quantities.
          </p>
        </summary>
        <div className="mt-4 space-y-5">
          {EQUIPMENT_SLOT_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-medium text-zinc-200">{group.label}</h3>
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                {group.slots.map((slot) => {
                  const legalItems = getLegalBackpackItemsForSlot(slot);
                  const selectedItemId = builderData.equippedSlots[slot] ?? "";
                  const selectedItem = backpackItems.find((item) => item.id === selectedItemId);
                  const disabledByTwoHanded = slot === "offHand" && isOffHandLocked;
                  if (selectedItem) {
                    return (
                      <EquippedItemMiniCard
                        key={slot}
                        slot={slot}
                        item={selectedItem}
                        canEdit={canEdit}
                        saving={saving}
                        onClear={() => updateEquipmentSlot(slot, "")}
                      />
                    );
                  }

                  return (
                    <label
                      key={slot}
                      className="block rounded-lg border border-zinc-800 bg-black p-3"
                    >
                      <span className="text-sm font-medium text-zinc-200">
                        {EQUIPMENT_SLOT_LABELS[slot]}
                      </span>
                      <select
                        value={selectedItemId}
                        onChange={(event) => updateEquipmentSlot(slot, event.target.value)}
                        disabled={!canEdit || saving || disabledByTwoHanded}
                        className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                      >
                        <option value="">
                          {disabledByTwoHanded
                            ? "Unavailable - two-handed weapon equipped"
                            : "Empty"}
                        </option>
                        {legalItems.map((item) => {
                          const usedCount = equippedUseCounts.get(item.id) ?? 0;
                          return (
                            <option key={item.id} value={item.id}>
                              {item.itemTemplate.name ?? "(Unnamed item)"} ({usedCount}/
                              {item.quantity} used)
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          <h3 className="font-medium text-zinc-200">Backpack</h3>
          {backpackItems.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 bg-black p-3 text-sm text-zinc-500">
              No Backpack items assigned to this character yet.
            </p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
              <div className="space-y-2">
                {backpackItems.map((item) => {
                  const usedCount = equippedUseCounts.get(item.id) ?? 0;
                  const selected = selectedBackpackItemId === item.id;
                  const isEquipped = usedCount > 0;
                  const transferableQuantity = getTransferableBackpackQuantity(item);
                  return (
                    <article
                      key={item.id}
                      className={`rounded-lg border p-2 transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-950/20"
                          : "border-zinc-800 bg-black hover:border-zinc-700 hover:bg-zinc-950"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedBackpackItemId(item.id)}
                          className="min-w-0 flex-1 rounded-md px-1 py-1 text-left focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-zinc-100">
                              {item.itemTemplate.name ?? "(Unnamed item)"}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {formatBackpackItemMeta(item) || "No item details"}
                            </div>
                          </div>
                        </button>
                        <div className="flex shrink-0 flex-wrap items-center gap-1 text-[11px] text-zinc-300">
                          <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
                            Qty {item.quantity}
                          </span>
                          <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
                            Used {usedCount}
                          </span>
                          {selected ? (
                            <span className="rounded border border-emerald-600 bg-emerald-950/40 px-2 py-1 text-emerald-100">
                              Selected
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              isEquipped
                                ? handleUnequipBackpackItem(item)
                                : handleEquipBackpackItem(item)
                            }
                            disabled={!canEdit || saving}
                            className={`rounded border px-2 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                              isEquipped
                                ? "border-amber-700 text-amber-200 hover:bg-amber-950/30"
                                : "border-emerald-700 text-emerald-100 hover:bg-emerald-950/30"
                            }`}
                          >
                            {isEquipped ? "Unequip" : "Equip"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openBackpackTransfer(item)}
                            disabled={
                              !canEdit ||
                              saving ||
                              transferringBackpackItem ||
                              transferTargets.length === 0 ||
                              transferableQuantity <= 0
                            }
                            className="rounded border border-sky-700 px-2 py-1 text-[11px] font-medium text-sky-100 hover:bg-sky-950/30 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Give
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="min-w-0">
                {selectedBackpackItem ? (
                  <BackpackItemPreview item={selectedBackpackItem} />
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-800 bg-black p-4 text-sm text-zinc-500">
                    Select a Backpack item to preview its details.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </details>

      <details
        className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
        data-testid="character-builder-section-signature-move"
      >
        <summary className="cursor-pointer">
          <h2 className="text-lg font-semibold">Signature Move</h2>
        </summary>
        <div className="mt-4 space-y-4">
          <div
            className={`rounded-lg border p-3 ${
              signatureMoveEditorBudget.overspent
                ? "border-red-800 bg-red-950/20"
                : "border-zinc-800 bg-black"
            }`}
          >
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs text-zinc-500">Signature Pool</div>
                <div className="text-lg font-semibold">{signatureMoveEditorBudget.powerPool}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Spend Scalar</div>
                <div className="text-lg font-semibold">x{formatPowerNumber(signatureMoveEditorBudget.playerPowerSpendScalar)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Spent</div>
                <div className="text-lg font-semibold">{formatPowerNumber(signatureMoveEditorBudget.totalSpent)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Remaining</div>
                <div className={signatureMoveEditorBudget.overspent ? "text-lg font-semibold text-red-300" : "text-lg font-semibold"}>
                  {formatPowerNumber(signatureMoveEditorBudget.remaining)}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Signature Move uses the same power builder rules with a separate Character Level x 20 pool.
            </p>
          </div>

          {renderPowerEditorCards({
            powers: [signatureMoveDraft],
            budget: signatureMoveEditorBudget,
            emptyMessage: "No Signature Move authored yet.",
            getPowerIndex: () => SIGNATURE_MOVE_POWER_INDEX,
            getPowerFallbackName: () => "Signature Move",
            allowRemove: false,
          })}
          {signatureMoveValidationErrors.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-300">
              {signatureMoveValidationErrors.map((validationError) => (
                <li key={validationError}>{validationError}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>

      <details
        className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
        data-testid="character-builder-section-powers"
      >
        <summary className="cursor-pointer">
          <h2 className="text-lg font-semibold">Powers</h2>
        </summary>
        <div className="mt-4 space-y-4">
          <div
            className={`sticky top-24 z-20 rounded-lg border p-3 shadow-lg shadow-black/30 ${
              powerBudget.overspent
                ? "border-red-800 bg-red-950"
                : "border-zinc-800 bg-black"
            }`}
          >
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs text-zinc-500">Power Pool</div>
                <div className="text-lg font-semibold">{powerBudget.powerPool}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Spend Scalar</div>
                <div className="text-lg font-semibold">x{formatPowerNumber(powerBudget.playerPowerSpendScalar)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Spent</div>
                <div className="text-lg font-semibold">{formatPowerNumber(powerBudget.totalSpent)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Remaining</div>
                <div className={powerBudget.overspent ? "text-lg font-semibold text-red-300" : "text-lg font-semibold"}>
                  {formatPowerNumber(powerBudget.remaining)}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Player powers spend BasePowerValue from the shared Phase 6 resolver. Spark and
              Restrictions are reserved at 0% in this version.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={addPower}
              disabled={!canEdit || saving}
              className="rounded-lg border border-emerald-700 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-950/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Power
            </button>
          </div>

          {renderPowerEditorCards({
            powers: builderData.powers,
            budget: powerBudget,
            emptyMessage: "No powers authored yet.",
            defaultCollapsed: true,
          })}
          {powerValidationErrors.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-300">
              {powerValidationErrors.map((validationError) => (
                <li key={validationError}>{validationError}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>

    </form>
  );

  const previewCharacter = {
    id: characterId,
    name: previewName,
    imageUrl: draft?.imageUrl.trim() || payload?.character.imageUrl || null,
    age: previewAge || null,
    race: previewRace || null,
    description: previewDescription || null,
    level: previewLevel,
    archivedAt: payload?.character.archivedAt ?? null,
  };

  const previewPanel = (
    <aside className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Live Sheet Preview
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            This preview uses the same sheet layout family as print mode.
          </p>
        </div>
        <label className="grid gap-1 text-xs uppercase tracking-wide text-zinc-500">
          Preview Theme
          <select
            value={previewTheme}
            onChange={(event) => setPreviewTheme(event.target.value as CharacterSheetTheme)}
            className="rounded border border-zinc-800 bg-black px-2 py-1 text-sm normal-case tracking-normal text-zinc-100"
          >
            {Object.entries(CHARACTER_SHEET_THEME_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <CharacterSheetPreview
        character={previewCharacter}
        builderData={builderData}
        backpackItems={backpackItems as CharacterBuilderDerivedBackpackItem[]}
        derivedStats={derivedCombatStats}
        powerBudget={powerBudget}
        signatureMoveBudget={signatureMoveBudget}
        traitSummary={traitSummary}
        printType="compact-colour"
        theme={previewTheme}
        mode="preview"
        campaignName={payload?.campaign.name ?? campaignId}
        assignedPlayerLabel={privacySafePlayerLabel(payload?.assignedPlayerLabel)}
      />
    </aside>
  );
  if (loading) {
    return (
      <main className="min-h-screen bg-black p-6 text-zinc-100">
        <div className="mx-auto max-w-6xl text-zinc-400">Loading character builder...</div>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main className="min-h-screen bg-black p-6 text-zinc-100">
        <div className="mx-auto max-w-3xl space-y-4">
          <CampaignNav campaignId={campaignId} />
          <h1 className="text-xl font-semibold">Character Builder</h1>
          <p className="text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => router.replace(`/campaign/${campaignId}/characters`)}
            className="rounded-lg border border-zinc-800 px-4 py-2 hover:bg-zinc-950"
          >
            Back to characters
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-zinc-950 text-zinc-100"
      data-testid="character-builder-root"
    >
      <div className="w-full space-y-6 px-0 md:px-6">
        <div className="space-y-6 px-4 pt-4 md:px-6">
          <CampaignNav campaignId={campaignId} />

          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm text-zinc-400">
                {payload?.campaign.name ?? "Campaign"}
              </div>
              <h1 className="text-2xl font-semibold">Character Builder</h1>
              <p className="mt-1 max-w-3xl text-sm text-zinc-500">
                Character identity, narrative details, Characteristics, Attributes,
                Resist Points, player Traits, Backpack equipment, and derived combat stats.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(`/campaign/${campaignId}/characters/${characterId}/print`)}
                className="rounded-lg border border-zinc-800 px-4 py-2 text-sm hover:bg-zinc-950"
              >
                Print Character
              </button>
              <button
                type="button"
                onClick={() => router.push(`/campaign/${campaignId}/characters`)}
                className="rounded-lg border border-zinc-800 px-4 py-2 text-sm hover:bg-zinc-950"
              >
                Back to Character Management
              </button>
            </div>
          </header>
        </div>

        {isArchived ? (
          <div className="rounded-xl border border-amber-800 bg-amber-950/20 p-4 text-sm text-amber-200">
            This character is archived. Game Directors may inspect or update the shell,
            but assigned Players do not receive active editable access.
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

        <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900/40 lg:hidden">
          <div className="grid grid-cols-2">
            <button
              type="button"
              aria-pressed={mobileView === "editor"}
              onClick={() => setMobileView("editor")}
              className={`px-3 py-2 text-xs font-semibold ${
                mobileView === "editor"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Editor
            </button>
            <button
              type="button"
              aria-pressed={mobileView === "preview"}
              onClick={() => setMobileView("preview")}
              className={`px-3 py-2 text-xs font-semibold ${
                mobileView === "preview"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className={`${mobileView === "preview" ? "hidden" : "block"} min-w-0 space-y-5 lg:block`}>
            {editorPanel}
          </div>
          <div
            className={`${mobileView === "editor" ? "hidden" : "block"} min-w-0 self-start space-y-3 lg:sticky lg:top-0 lg:block lg:max-h-screen lg:overflow-y-auto`}
          >
            {previewPanel}
          </div>
        </div>
      </div>
      {pendingHandEquipItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hand-equip-title"
        >
          <div className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div>
              <h2 id="hand-equip-title" className="text-lg font-semibold text-zinc-100">
                Equip in which hand?
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {pendingHandEquipItem.itemTemplate.name ?? "(Unnamed item)"}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => equipBackpackItemToSlot(pendingHandEquipItem, "mainHand")}
                disabled={!getShortcutLegalSlots(pendingHandEquipItem).includes("mainHand")}
                className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-950/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Main Hand
              </button>
              <button
                type="button"
                onClick={() => equipBackpackItemToSlot(pendingHandEquipItem, "offHand")}
                disabled={!getShortcutLegalSlots(pendingHandEquipItem).includes("offHand")}
                className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-950/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Off Hand
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPendingHandEquipItemId("")}
              className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {transferDraft && transferBackpackItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="backpack-transfer-title"
        >
          <form
            onSubmit={handleBackpackTransfer}
            className="w-full max-w-md space-y-4 rounded-xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl"
          >
            <div>
              <h2 id="backpack-transfer-title" className="text-lg font-semibold text-zinc-100">
                Give Backpack item
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {transferBackpackItem.itemTemplate.name ?? "(Unnamed item)"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Available to give: {getTransferableBackpackQuantity(transferBackpackItem)}
              </p>
            </div>
            <label className="block">
              <span className="text-xs text-zinc-400">Recipient</span>
              <select
                value={transferDraft.targetCharacterId}
                onChange={(event) =>
                  setTransferDraft((current) =>
                    current ? { ...current, targetCharacterId: event.target.value } : current,
                  )
                }
                disabled={transferringBackpackItem}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              >
                {transferTargets.map((target) => (
                  <option key={target.characterId} value={target.characterId}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-zinc-400">Quantity</span>
              <input
                type="number"
                min={1}
                max={getTransferableBackpackQuantity(transferBackpackItem)}
                step={1}
                value={transferDraft.quantity}
                onChange={(event) =>
                  setTransferDraft((current) =>
                    current ? { ...current, quantity: event.target.value } : current,
                  )
                }
                disabled={transferringBackpackItem}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setTransferDraft(null)}
                disabled={transferringBackpackItem}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={transferringBackpackItem}
                className="rounded-lg border border-sky-700 px-3 py-2 text-sm font-medium text-sky-100 hover:bg-sky-950/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {transferringBackpackItem ? "Giving..." : "Confirm Give"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
