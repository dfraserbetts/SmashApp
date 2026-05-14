"use client";

import type React from "react";
import Image from "next/image";

import { useScaledPreview } from "@/app/summoning-circle/components/useScaledPreview";
import { getForgeRarityPalette } from "@/lib/forge/itemRarityPalette";
import {
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOTS,
  renderCharacteristicDescriptor,
  renderGreatSecret,
  selectedTraitSummary,
  signedTraitPointDisplay,
  type CharacterAttribute,
  type CharacterBuilderData,
  type EquipmentSlotKey,
} from "@/lib/characterBuilder/core";
import type {
  CharacterBuilderDerivedBackpackItem,
  CharacterDerivedCombatStats,
} from "@/lib/characterBuilder/derivedStats";
import type { CharacterPowerBudget } from "@/lib/characterBuilder/powers";
import type { MonsterModifierField } from "@/lib/summoning/equipment";
import type { AttributePlacement } from "@/lib/summoning/types";

export type CharacterSheetPrintType =
  | "full-colour"
  | "full-print-friendly"
  | "compact-colour"
  | "compact-print-friendly";

export type CharacterSheetKey = "main" | "character" | "powers" | "inventory";

export type CharacterSheetSelection = Record<CharacterSheetKey, boolean>;

export const CHARACTER_SHEET_PRINT_TYPE_LABELS: Record<CharacterSheetPrintType, string> = {
  "full-colour": "Full Colour Sheet",
  "full-print-friendly": "Full Print Friendly Sheet",
  "compact-colour": "Compact Colour Sheet",
  "compact-print-friendly": "Compact Print Friendly Sheet",
};

export const CHARACTER_SHEET_LABELS: Record<CharacterSheetKey, string> = {
  main: "Main Sheet",
  character: "Character Sheet",
  powers: "Power Sheet(s)",
  inventory: "Inventory Sheet",
};

export const DEFAULT_CHARACTER_SHEETS: CharacterSheetSelection = {
  main: true,
  character: true,
  powers: true,
  inventory: true,
};

export type CharacterSheetCharacter = {
  id: string;
  name: string | null;
  imageUrl: string | null;
  age: string | null;
  race: string | null;
  description: string | null;
  level: number;
  archivedAt?: string | null;
};

type EquippedEntry = {
  slot: EquipmentSlotKey;
  backpackItem: CharacterBuilderDerivedBackpackItem;
};

type CharacterTraitSummary = ReturnType<typeof selectedTraitSummary>;

type CharacterSheetPreviewProps = {
  character: CharacterSheetCharacter;
  builderData: CharacterBuilderData;
  backpackItems: CharacterBuilderDerivedBackpackItem[];
  derivedStats: CharacterDerivedCombatStats;
  powerBudget: CharacterPowerBudget;
  traitSummary: CharacterTraitSummary;
  printType?: CharacterSheetPrintType;
  sheets?: Partial<CharacterSheetSelection>;
  mode?: "preview" | "print";
  campaignName?: string | null;
  assignedPlayerLabel?: string | null;
  className?: string;
};

const ATTRIBUTE_MODIFIER_FIELDS: Record<CharacterAttribute, MonsterModifierField> = {
  Attack: "attackModifier",
  Guard: "guardModifier",
  Fortitude: "fortitudeModifier",
  Intellect: "intellectModifier",
  Synergy: "synergyModifier",
  Bravery: "braveryModifier",
};

function display(value: string | null | undefined, fallback = "UNNAMED") {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function compactLine(line: string) {
  return line.replace("||", " ").trim();
}

function formatSheetNumber(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function signed(value: number) {
  const normalized = Math.trunc(value);
  return normalized > 0 ? `+${normalized}` : String(normalized);
}

function isHttpUrl(value: string | null | undefined) {
  return Boolean(value?.trim().match(/^https?:\/\//i));
}

function itemName(item: CharacterBuilderDerivedBackpackItem) {
  return item.itemTemplate.name?.trim() || "(Unnamed item)";
}

function equippedSlotDisplayLabel(
  slot: EquipmentSlotKey,
  item: CharacterBuilderDerivedBackpackItem,
) {
  return (slot === "mainHand" || slot === "offHand") &&
    item.itemTemplate.type === "WEAPON" &&
    item.itemTemplate.size === "TWO_HANDED"
    ? "Two-Handed"
    : EQUIPMENT_SLOT_LABELS[slot];
}

function titleCase(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return "-";
  return raw
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function itemDescriptorPreview(item: CharacterBuilderDerivedBackpackItem, maxLines = 2) {
  const sections = item.itemTemplate.descriptorSections ?? [];
  const sectionLines = sections.flatMap((section) => section.lines.map((line) => compactLine(line)));
  const lines = sectionLines.length > 0 ? sectionLines : item.itemTemplate.details ? [item.itemTemplate.details] : [];
  return lines.filter(Boolean).slice(0, maxLines);
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

function compactProtectionValue(value: string, label: "PPV" | "MPV") {
  const numeric = Math.trunc(Number(value));
  return `${numeric > 0 ? "+" : ""}${numeric} ${label}`;
}

function normalizeSignedInput(value: string) {
  return value.replace(/[−–—]/g, "-").trim();
}

function compactSignedValue(value: string) {
  const numeric = Math.trunc(Number(normalizeSignedInput(value)));
  if (!Number.isFinite(numeric)) return value;
  return numeric > 0 ? `+${numeric}` : String(numeric);
}

function compactDamageType(value: string) {
  return value.trim().toLowerCase();
}

function compactGreaterSuccessClause(value: string) {
  const stacks = value
    .split(/\s+or\s+|\s*,\s*|\s+and\s+/i)
    .map((stack) => stack.replace(/^1 stack of\s+/i, "").trim())
    .filter(Boolean);

  if (stacks.length === 0) return null;
  return `GS: ${stacks.map((stack) => `+1 ${stack}`).join(" / ")}`;
}

function compactWeaponRange(rangeText: string) {
  const adjacentMatch = rangeText.match(/^(\d+) adjacent targets?$/i);
  if (adjacentMatch) return `${adjacentMatch[1]} melee`;

  const rangedMatch = rangeText.match(/^(\d+) targets? within (\d+)ft$/i);
  if (rangedMatch) return `${rangedMatch[1]} ranged ${rangedMatch[2]}ft`;

  const aoeMatch = rangeText.match(
    /^(up to )?(\d+) (?:x|\u00d7) (?:(\d+)ft )?(Spheres?|Cones?|Lines?)(?: within (\d+)ft| centered on yourself| emanating from yourself)$/i,
  );
  if (aoeMatch) {
    const [, upTo, count, size, shape, distance] = aoeMatch;
    const singularShape = shape.replace(/s$/i, "").toLowerCase();
    return [
      `${upTo ? "up to " : ""}${count} ${singularShape}`,
      size ? `${size}ft` : null,
      distance ? `@ ${distance}ft` : "self",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return rangeText.replace(/^1 adjacent target$/i, "1 melee");
}

function compactEquippedItemBullet(line: string) {
  const cleaned = stripForgeLineLabel(line);
  const withoutPeriod = cleaned.replace(/\.$/, "").trim();

  const customMatch = withoutPeriod.match(/^Custom:\s*(.+)$/i);
  if (customMatch) {
    return customMatch[1].trim();
  }

  const vrpMatch = withoutPeriod.match(
    /^Whilst (?:wearing this armor|wielding this shield), you (gain|suffer) ([+\-−]?\d+)( dice)? to Defence rolls against ([A-Za-z ]+) attacks$/i,
  );
  if (vrpMatch) {
    const action = vrpMatch[1].toLowerCase();
    const rawAmount = normalizeSignedInput(vrpMatch[2]);
    const amountNumber = Math.abs(Math.trunc(Number(rawAmount)));
    const signedAmount = action === "suffer" ? `-${amountNumber}` : `+${amountNumber}`;
    const damageType = vrpMatch[4].trim();
    return vrpMatch[3]
      ? `${signedAmount} dice vs ${damageType}`
      : `${signedAmount} defence vs ${damageType}`;
  }

  const rawVrpMatch = withoutPeriod.match(
    /^([+\-−]?\d+)( dice)? (?:to )?Defence rolls against ([A-Za-z ]+) attacks$/i,
  );
  if (rawVrpMatch) {
    const amount = compactSignedValue(rawVrpMatch[1]);
    return rawVrpMatch[2]
      ? `${amount} dice vs ${rawVrpMatch[3].trim()}`
      : `${amount} defence vs ${rawVrpMatch[3].trim()}`;
  }

  const attributeMatch = withoutPeriod.match(
    /^Whilst (?:wielding this shield|wearing this armor|wearing this item), (?:the wielder gains|you gain) ([+\-−]?\d+) to ([A-Za-z ]+)$/i,
  );
  if (attributeMatch) {
    return `${compactSignedValue(attributeMatch[1])} ${attributeMatch[2].trim()}`;
  }

  const combinedProtectionMatch = withoutPeriod.match(
    /^Whilst (?:wearing this armor|wielding this shield), increase your Physical Protection by (\d+), and Mental Protection by (\d+)$/i,
  );
  if (combinedProtectionMatch) {
    return [
      compactProtectionValue(combinedProtectionMatch[1], "PPV"),
      compactProtectionValue(combinedProtectionMatch[2], "MPV"),
    ].join(" / ");
  }

  const singleProtectionMatch = withoutPeriod.match(
    /^Whilst (?:wearing this armor|wielding this shield), increase your (Physical|Mental) Protection by (\d+)$/i,
  );
  if (singleProtectionMatch) {
    return compactProtectionValue(
      singleProtectionMatch[2],
      singleProtectionMatch[1].toLowerCase() === "physical" ? "PPV" : "MPV",
    );
  }

  const spikedMatch = withoutPeriod.match(
    /^Spiked:\s*Whenever you are the target of a melee attack, the attacking creature suffers (\d+) physical piercing wounds?$/i,
  );
  if (spikedMatch) {
    return `Spiked ${spikedMatch[1]}`;
  }

  const namedWoundsMatch = withoutPeriod.match(
    /^([A-Za-z][A-Za-z '-]*):\s+.+?\b(\d+)\s+(?:physical|mental|[A-Za-z]+)?\s*wounds?$/i,
  );
  if (namedWoundsMatch) {
    return `${namedWoundsMatch[1].trim()} ${namedWoundsMatch[2]}`;
  }

  const standaloneGreaterSuccessMatch = withoutPeriod.match(
    /^Each greater success inflicts (.+)$/i,
  );
  if (standaloneGreaterSuccessMatch) {
    return compactGreaterSuccessClause(standaloneGreaterSuccessMatch[1]) ?? cleaned;
  }

  const weaponMatch = withoutPeriod.match(
    /^(?:[A-Za-z ]+:\s*)?Choose (.+) and roll weapon skill dice\. This (?:weapon|shield) inflicts (\d+) (?:physical|mental) ([A-Za-z ]+) wounds? per success(?:\. Each greater success inflicts (.+))?$/i,
  );
  if (weaponMatch) {
    const range = compactWeaponRange(weaponMatch[1]);
    const base = `${range} - ${weaponMatch[2]} ${compactDamageType(weaponMatch[3])} wounds`;
    const greaterSuccess = weaponMatch[4] ? compactGreaterSuccessClause(weaponMatch[4]) : null;
    return greaterSuccess ? `${base} / ${greaterSuccess}` : base;
  }

  const namedAttributeMatch = withoutPeriod.match(/^([A-Za-z][A-Za-z '-]*):\s+\S.+$/);
  if (namedAttributeMatch) {
    return namedAttributeMatch[1].trim();
  }

  return cleaned;
}

type ActiveEffectWinner = {
  value: number;
  occurrenceKey: string;
  order: number;
};

type ActiveEffectRegistry = Map<string, ActiveEffectWinner>;

function effectValue(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function inferRenderedEffectMetadata(line: string) {
  const cleaned = stripForgeLineLabel(line).replace(/\.$/, "").trim();
  const namedWoundsMatch = cleaned.match(
    /^([A-Za-z][A-Za-z '-]*):\s+.+?\b(\d+)\s+(?:(?:physical|mental)\s+)?[A-Za-z ]*wounds?\b/i,
  );
  if (!namedWoundsMatch) return null;

  return {
    family: `ATTRIBUTE:${namedWoundsMatch[1].trim().toLowerCase()}`,
    value: Math.trunc(Number(namedWoundsMatch[2])),
  };
}

function shouldRenderEffect(
  registry: ActiveEffectRegistry | undefined,
  family: string | null | undefined,
  value: number | null | undefined,
  occurrenceKey: string,
) {
  if (!registry || !family || value === null || value === undefined) return true;
  return registry.get(family)?.occurrenceKey === occurrenceKey;
}

function buildActiveEffectRegistry(equipped: EquippedEntry[]) {
  const registry: ActiveEffectRegistry = new Map();
  let order = 0;

  function add(family: string | null | undefined, value: number | null | undefined, occurrenceKey: string) {
    if (!family || value === null || value === undefined) return;
    const existing = registry.get(family);
    if (!existing || value > existing.value || (value === existing.value && order < existing.order)) {
      registry.set(family, { value, occurrenceKey, order });
    }
    order += 1;
  }

  for (const { slot, backpackItem } of equipped) {
    const template = backpackItem.itemTemplate;
    (template.globalAttributeModifiers ?? []).forEach((modifier, index) => {
      const attribute = modifier.attribute?.trim();
      const value = effectValue(modifier.amount);
      add(
        attribute ? `MODIFIER:${attribute.toLowerCase()}` : null,
        value === null ? null : Math.abs(value),
        `${slot}:${backpackItem.id}:modifier:${index}`,
      );
    });

    (template.descriptorSections ?? []).forEach((section, sectionIndex) => {
      section.lines.forEach((line, lineIndex) => {
        const inferred = inferRenderedEffectMetadata(line);
        add(
          section.lineEffectFamilies?.[lineIndex] ?? inferred?.family,
          section.lineEffectValues?.[lineIndex] ?? inferred?.value ?? null,
          `${slot}:${backpackItem.id}:section:${sectionIndex}:${lineIndex}`,
        );
      });
    });
  }

  return registry;
}

function equippedItemBullets(
  slot: EquipmentSlotKey,
  item: CharacterBuilderDerivedBackpackItem,
  activeEffectRegistry?: ActiveEffectRegistry,
) {
  const template = item.itemTemplate;
  const bullets: string[] = [];

  for (const [index, modifier] of (template.globalAttributeModifiers ?? []).entries()) {
    const attribute = modifier.attribute?.trim();
    const value = effectValue(modifier.amount);
    const family = attribute ? `MODIFIER:${attribute.toLowerCase()}` : null;
    const occurrenceKey = `${slot}:${item.id}:modifier:${index}`;
    if (!shouldRenderEffect(activeEffectRegistry, family, value === null ? null : Math.abs(value), occurrenceKey)) {
      continue;
    }
    const bullet = formatCompactModifier(modifier.attribute, modifier.amount);
    if (bullet) bullets.push(bullet);
  }

  for (const [sectionIndex, section] of (template.descriptorSections ?? []).entries()) {
    for (const [lineIndex, line] of section.lines.entries()) {
      const inferred = inferRenderedEffectMetadata(line);
      if (
        !shouldRenderEffect(
          activeEffectRegistry,
          section.lineEffectFamilies?.[lineIndex] ?? inferred?.family,
          section.lineEffectValues?.[lineIndex] ?? inferred?.value ?? null,
          `${slot}:${item.id}:section:${sectionIndex}:${lineIndex}`,
        )
      ) {
        continue;
      }
      const bullet = compactEquippedItemBullet(line);
      if (bullet) bullets.push(bullet);
    }
  }

  const hasCompactProtection = bullets.some((bullet) => /\+\d+\s+P[MP]V/i.test(bullet));
  if (!hasCompactProtection) {
    if (template.ppv && template.ppv > 0) bullets.push(`${template.ppv} PPV`);
    if (template.mpv && template.mpv > 0) bullets.push(`${template.mpv} MPV`);
  }

  if (bullets.length === 0 && template.details) {
    bullets.push(template.details);
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

function selectedEquippedItems(
  data: CharacterBuilderData,
  backpackItems: CharacterBuilderDerivedBackpackItem[],
) {
  const byId = new Map(backpackItems.map((item) => [item.id, item]));
  return EQUIPMENT_SLOTS.flatMap((slot) => {
    const backpackItemId = data.equippedSlots[slot];
    const backpackItem = backpackItemId ? byId.get(backpackItemId) : null;
    return backpackItem ? [{ slot, backpackItem }] : [];
  });
}

function EquippedItemCompactCard({
  slot,
  item,
  activeEffectRegistry,
}: {
  slot: EquipmentSlotKey;
  item: CharacterBuilderDerivedBackpackItem;
  activeEffectRegistry?: ActiveEffectRegistry;
}) {
  const template = item.itemTemplate;
  const palette = getForgeRarityPalette(template.rarity);
  const slotLabel = equippedSlotDisplayLabel(slot, item);
  const typeLabel = titleCase(template.type);
  const levelAndType = [template.level ? `Level ${template.level}` : null, typeLabel === "-" ? null : typeLabel]
    .filter(Boolean)
    .join(" ");
  const rarityLabel = titleCase(template.rarity);
  const imageUrl = isHttpUrl(template.itemUrl) ? template.itemUrl?.trim() : null;
  const bullets = equippedItemBullets(slot, item, activeEffectRegistry);

  return (
    <article
      className={`space-y-2 overflow-hidden rounded border p-2 ${palette.panelBorderClass} ${palette.panelShadowClass}`}
      style={{
        backgroundImage: palette.backgroundImage,
        borderColor: palette.panelBorderColor,
      }}
    >
      <div className="min-w-0">
        <p className="truncate text-[11px] text-white">
          {slotLabel}
          {levelAndType ? ` - ${levelAndType}` : ""}
        </p>
        <p
          className={`truncate text-sm ${palette.nameTextClass}`}
          style={{ color: palette.headerColor }}
        >
          {itemName(item)}
          {rarityLabel !== "-" ? ` - ${rarityLabel}` : ""}
        </p>
      </div>
      <div
        className={`grid h-[180px] grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 overflow-hidden rounded border p-2 ${palette.panelBorderClass} ${palette.panelShadowClass}`}
        style={{
          borderColor: palette.panelBorderColor,
          backgroundColor: "rgba(3, 7, 18, 0.34)",
        }}
      >
        <div
          className={`flex min-w-0 items-center justify-center overflow-hidden rounded border ${palette.imageBorderClass}`}
          style={{
            borderColor: palette.panelBorderColor,
            backgroundColor: "rgba(3, 7, 18, 0.34)",
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

function SheetFrame({
  title,
  subtitle,
  children,
  className = "",
  contentClassName = "space-y-3 p-4",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <article
      aria-label={subtitle ? `${title}: ${subtitle}` : title}
      className={[
        "cb-sheet-page overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm",
        className,
      ].join(" ")}
    >
      <div className={contentClassName}>{children}</div>
    </article>
  );
}

function SheetPanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={["cb-sheet-panel border border-zinc-800 bg-black/50 p-2.5", className].join(" ")}>
      <h3 className="border-b border-zinc-800 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function StatTile({
  label,
  value,
  helper,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className={["cb-stat-tile border border-zinc-800 bg-zinc-950/70 px-2 py-1.5", emphasis ? "ring-1 ring-emerald-700/50" : ""].join(" ")}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold leading-tight text-zinc-100">{value}</div>
      {helper ? <div className="mt-1 text-[11px] text-zinc-500">{helper}</div> : null}
    </div>
  );
}

function PortraitBlock({
  character,
  className = "",
  imageClassName = "max-h-56",
}: {
  character: CharacterSheetCharacter;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div className={["cb-portrait flex min-h-44 items-center justify-center border border-zinc-800 bg-black", className].join(" ")}>
      {isHttpUrl(character.imageUrl) ? (
        <img
          src={character.imageUrl ?? ""}
          alt={display(character.name)}
          className={[imageClassName, "w-full object-contain"].join(" ")}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-sm text-zinc-500">Portrait</span>
      )}
    </div>
  );
}

function AttributeCard({
  attribute,
  builderData,
  derivedStats,
  tone = "neutral",
}: {
  attribute: CharacterAttribute;
  builderData: CharacterBuilderData;
  derivedStats: CharacterDerivedCombatStats;
  tone?: "mental" | "physical" | "neutral";
}) {
  const base = builderData.attributes[attribute];
  const baseNumber = typeof base === "number" ? base : 0;
  const modifier = derivedStats.itemModifiers[ATTRIBUTE_MODIFIER_FIELDS[attribute]] ?? 0;
  const resist = builderData.resistPoints[attribute] ?? 0;
  const toneClass =
    tone === "mental"
      ? "border-cyan-900/70 bg-cyan-950/15"
      : tone === "physical"
        ? "border-emerald-900/70 bg-emerald-950/15"
        : "border-zinc-800 bg-zinc-950/60";
  const isPhysical = tone === "physical";
  const detailBlock = (
    <div
      className={[
        "grid gap-0.5 text-[9px] leading-tight text-zinc-400",
        isPhysical ? "text-right" : "text-left",
      ].join(" ")}
    >
      <p className="whitespace-nowrap">
        <span className="uppercase tracking-[0.08em] text-zinc-500">Modifier</span>{" "}
        <span className="text-[10px] font-semibold text-zinc-200">
          {modifier ? signed(modifier) : "0"}
        </span>
      </p>
      <p className="whitespace-nowrap">
        <span className="uppercase tracking-[0.08em] text-zinc-500">Resist</span>{" "}
        <span className="text-[10px] font-semibold text-zinc-200">{resist}</span>
      </p>
    </div>
  );
  const valueBlock = (
    <div className="flex items-center justify-center text-[2.1rem] font-semibold leading-none text-zinc-100">
      {baseNumber || "-"}
    </div>
  );

  return (
    <div className={`cb-attribute-card border px-1.5 py-1 ${toneClass}`}>
      <div className="border-b border-zinc-800/80 pb-0.5 text-center text-[16px] font-semibold leading-tight text-zinc-100">
        {attribute}
      </div>
      <div
        className={[
          "mt-0.5 grid min-h-14 items-center gap-1",
          isPhysical ? "grid-cols-[4.5rem_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_4.5rem]",
        ].join(" ")}
      >
        {isPhysical ? valueBlock : detailBlock}
        {isPhysical ? detailBlock : valueBlock}
      </div>
    </div>
  );
}

function MainReferenceTile({
  tone,
  stat,
}: {
  tone: "mental" | "physical";
  stat: { label: string; value: React.ReactNode; helper?: React.ReactNode };
}) {
  const alignment = tone === "physical" ? "text-right" : "text-left";

  return (
    <div className={`cb-main-reference-tile border border-zinc-800 bg-zinc-950/70 px-1.5 py-1 ${alignment}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">{stat.label}</div>
      <div className="mt-0.5 text-4xl font-semibold leading-none text-zinc-100">{stat.value}</div>
      {stat.helper ? <div className="mt-0.5 text-[10px] text-zinc-500">{stat.helper}</div> : null}
    </div>
  );
}

function CombatSide({
  tone,
  stats,
  attributes,
  builderData,
  derivedStats,
}: {
  tone: "mental" | "physical";
  stats: Array<{ label: string; value: React.ReactNode; helper?: React.ReactNode }>;
  attributes: CharacterAttribute[];
  builderData: CharacterBuilderData;
  derivedStats: CharacterDerivedCombatStats;
}) {
  return (
    <div className="cb-combat-side grid gap-1">
      <div className="grid gap-1">
        {stats.map((stat) => (
          <MainReferenceTile key={stat.label} tone={tone} stat={stat} />
        ))}
      </div>
      {attributes.map((attribute) => (
        <AttributeCard
          key={attribute}
          attribute={attribute}
          builderData={builderData}
          derivedStats={derivedStats}
          tone={tone}
        />
      ))}
    </div>
  );
}

function MainCombatSection({
  title,
  header,
  children,
}: {
  title: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="cb-main-combat-section border border-zinc-800 bg-black/50 p-1.5">
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-1.5 border-b border-zinc-800 pb-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{title}</h3>
        {header}
      </div>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function MainMetricPill({
  label,
  value,
  labelClassName = "text-zinc-500",
}: {
  label: string;
  value: React.ReactNode;
  labelClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-950/50 px-1.5 py-0.5 text-[9px] leading-tight text-zinc-300">
      <span className={`uppercase tracking-[0.08em] ${labelClassName}`}>{label}</span>
      <span className="font-semibold text-zinc-100">{value}</span>
    </span>
  );
}

type MainSheetPlacementRow = {
  key: string;
  slot: EquipmentSlotKey;
  itemName: string;
  title: string;
  line: string;
  placement: AttributePlacement;
  effectFamily: string | null;
  effectValue: number | null;
  order: number;
};

type DamageInteractionKind = "VULNERABILITY" | "RESISTANCE" | "PROTECTION";

type DamageInteractionRow = {
  key: string;
  kind: DamageInteractionKind;
  damageType: string;
  value: number;
  effectFamily: string | null;
  effectValue: number | null;
  order: number;
};

function highestOnlyRows<T extends { effectFamily: string | null; effectValue: number | null; order: number }>(
  rows: T[],
) {
  const winners = new Map<string, T>();
  for (const row of rows) {
    if (!row.effectFamily || row.effectValue === null) continue;
    const existing = winners.get(row.effectFamily);
    if (!existing || row.effectValue > existing.effectValue! || (row.effectValue === existing.effectValue && row.order < existing.order)) {
      winners.set(row.effectFamily, row);
    }
  }

  return rows.filter((row) => {
    if (!row.effectFamily || row.effectValue === null) return true;
    return winners.get(row.effectFamily) === row;
  });
}

function mainSheetEquipmentPlacementRows(
  derivedStats: CharacterDerivedCombatStats,
  placements: ReadonlySet<AttributePlacement>,
  options: { lineMode?: "compact" | "full" } = {},
) {
  const rows: Array<{
    key: string;
    slot: EquipmentSlotKey;
    itemName: string;
    title: string;
    line: string;
    placement: AttributePlacement;
    effectFamily: string | null;
    effectValue: number | null;
    order: number;
  }> = [];
  const seen = new Set<string>();
  let order = 0;

  for (const section of derivedStats.itemOutputSections) {
    section.lines.forEach((line, index) => {
      const placement = section.linePlacements?.[index] ?? (section.title === "VRP" ? "GUARD" : null);
      const effectFamily = section.lineEffectFamilies?.[index] ?? null;
      if (!placement || !placements.has(placement)) return;
      if (section.title === "VRP" || effectFamily?.startsWith("VRP:")) return;

      const renderedLine =
        options.lineMode === "full" ? compactLine(line) : compactEquippedItemBullet(line);
      const inferred = inferRenderedEffectMetadata(line);
      const key = `${section.slot}::${section.itemName.toLowerCase()}::${placement}::${renderedLine.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        key,
        slot: section.slot,
        itemName: section.itemName,
        title: section.title,
        line: renderedLine,
        placement,
        effectFamily: effectFamily ?? inferred?.family ?? null,
        effectValue: section.lineEffectValues?.[index] ?? inferred?.value ?? null,
        order: order++,
      });
    });
  }

  return highestOnlyRows(rows);
}

function parseVrpEffectFamily(family: string | null | undefined) {
  const parts = family?.split(":") ?? [];
  if (parts.length !== 3 || parts[0] !== "VRP") return null;
  const kind = parts[1] as DamageInteractionKind;
  if (kind !== "VULNERABILITY" && kind !== "RESISTANCE" && kind !== "PROTECTION") return null;
  const damageType = titleCase(parts[2]);
  if (!damageType || damageType === "-") return null;
  return { kind, damageType };
}

function mainSheetDamageInteractionRows(derivedStats: CharacterDerivedCombatStats) {
  const rows: DamageInteractionRow[] = [];
  const seen = new Set<string>();
  let order = 0;

  for (const section of derivedStats.itemOutputSections) {
    section.lines.forEach((_line, index) => {
      const metadata = parseVrpEffectFamily(section.lineEffectFamilies?.[index]);
      const value = effectValue(section.lineEffectValues?.[index]);
      if (!metadata || value === null || value <= 0) return;

      const key = `${metadata.kind}::${metadata.damageType.toLowerCase()}::${value}`;
      if (seen.has(key)) return;
      seen.add(key);

      rows.push({
        key,
        kind: metadata.kind,
        damageType: metadata.damageType,
        value,
        effectFamily: section.lineEffectFamilies?.[index] ?? null,
        effectValue: value,
        order: order++,
      });
    });
  }

  return highestOnlyRows(rows);
}

const MAIN_TRAIT_ATTRIBUTE_PLACEMENTS = new Set<AttributePlacement>(["TRAITS", "GENERAL"]);
const MAIN_ATTACK_ATTRIBUTE_PLACEMENTS = new Set<AttributePlacement>(["ATTACK"]);
const MAIN_GUARD_ATTRIBUTE_PLACEMENTS = new Set<AttributePlacement>(["GUARD"]);

function groupMainSheetRowsBySlot(rows: MainSheetPlacementRow[]) {
  const bySlot = new Map<EquipmentSlotKey, MainSheetPlacementRow[]>();
  for (const row of rows) {
    const existing = bySlot.get(row.slot) ?? [];
    existing.push(row);
    bySlot.set(row.slot, existing);
  }
  return bySlot;
}

function formatMainAttackAttributeLine(row: MainSheetPlacementRow, options: { includeItemName?: boolean } = {}) {
  const cleaned = stripForgeLineLabel(row.line).trim();
  return options.includeItemName === false ? cleaned : `${row.itemName}: ${cleaned}`;
}

function RenderLeadIn({ line }: { line: string }) {
  const colonIndex = line.indexOf(":");
  if (colonIndex <= 0) return <>{line}</>;

  return (
    <>
      <span className="font-semibold">{line.slice(0, colonIndex + 1)}</span>
      {line.slice(colonIndex + 1)}
    </>
  );
}

function MainAttackAttributeLines({
  rows,
  title,
  inline = false,
}: {
  rows: MainSheetPlacementRow[];
  title?: string;
  inline?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <div
      className={[
        inline
          ? "mt-1 space-y-0.5 border-t border-zinc-800 pt-1"
          : "mt-1 space-y-0.5 border-b border-zinc-800 pb-1",
        "text-[10px] leading-snug text-zinc-300",
      ].join(" ")}
    >
      {title ? (
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          {title}
        </p>
      ) : null}
      {rows.map((row) => (
        <p key={row.key}>
          <RenderLeadIn line={formatMainAttackAttributeLine(row, { includeItemName: !inline })} />
        </p>
      ))}
    </div>
  );
}

function MainDefenceStringBoxes({ lines }: { lines: string[] }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {lines.map((line) => (
        <div
          key={line}
          className="cb-main-defence-box border border-zinc-800 bg-zinc-950/50 px-1.5 py-2 text-center text-[10px] leading-snug text-zinc-300"
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function MainAttackStringBoxes({
  attacks,
  compact,
  attackAttributeRowsBySlot,
}: {
  attacks: CharacterDerivedCombatStats["attacks"];
  compact: boolean;
  attackAttributeRowsBySlot: Map<EquipmentSlotKey, MainSheetPlacementRow[]>;
}) {
  const boxes = attacks.flatMap((attack) =>
    attack.lines.slice(0, compact ? 3 : attack.lines.length).map((line, index) => ({
      key: `${attack.slot}-${attack.label}-${index}`,
      label: attack.label,
      slot: attack.slot,
      slotLabel: attack.slotLabel,
      line,
    })),
  );

  if (boxes.length === 0) return null;
  const gridClass =
    boxes.length === 1
      ? "grid grid-cols-[45%] justify-center gap-1"
      : boxes.length === 2
        ? "grid grid-cols-2 gap-1"
        : "grid grid-cols-3 gap-1";

  return (
    <div className={gridClass}>
      {boxes.map((box) => (
        <div
          key={box.key}
          className="cb-main-output-row border border-zinc-800 bg-zinc-950/50 px-1.5 py-2 text-center text-[10px] leading-snug text-zinc-300"
        >
          <div className="mb-0.5 border-b border-zinc-800 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            {box.slotLabel}
          </div>
          <div className="mb-1 text-[10px] font-semibold leading-tight text-zinc-100">
            {box.label.replace(`${box.slotLabel}: `, "")}
          </div>
          <div><RenderLeadIn line={compactLine(box.line)} /></div>
          <MainAttackAttributeLines
            rows={attackAttributeRowsBySlot.get(box.slot) ?? []}
            inline
          />
        </div>
      ))}
    </div>
  );
}

function formatMainGuardAttributeLine(row: MainSheetPlacementRow) {
  const cleaned = stripForgeLineLabel(row.line).trim();
  const withoutPeriod = cleaned.replace(/\.$/, "").trim();
  const vrpMatch = withoutPeriod.match(
    /^Whilst (?:wearing this armor|wielding this shield), you (gain|suffer) ([+\-âˆ’]?\d+)( dice)? to Defence rolls against ([A-Za-z ]+) attacks$/i,
  );

  if (vrpMatch) {
    const action = vrpMatch[1].toLowerCase();
    const amount = Math.abs(Math.trunc(Number(normalizeSignedInput(vrpMatch[2]))));
    const sign = action === "suffer" ? "-" : "+";
    const dice = vrpMatch[3] ? " dice" : "";
    return `${row.itemName}: ${sign}${amount}${dice} to Defence rolls against ${vrpMatch[4].trim()} attacks`;
  }

  return `${row.itemName}: ${cleaned}`;
}

function MainGuardAttributeLines({ rows }: { rows: MainSheetPlacementRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="mt-1 space-y-0.5 border-t border-zinc-800 pt-1 text-[10px] leading-snug text-zinc-300">
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        General Defence Attributes
      </p>
      {rows.map((row) => (
        <p key={row.key}>{formatMainGuardAttributeLine(row)}</p>
      ))}
    </div>
  );
}

const DAMAGE_INTERACTION_GROUPS: Array<{
  kind: DamageInteractionKind;
  label: string;
  iconSrc: string;
  iconAlt: string;
}> = [
  {
    kind: "VULNERABILITY",
    label: "Vulnerability",
    iconSrc: "/icons/brokenshield.png",
    iconAlt: "broken shield",
  },
  {
    kind: "RESISTANCE",
    label: "Resistance",
    iconSrc: "/icons/shield.png",
    iconAlt: "shield",
  },
  {
    kind: "PROTECTION",
    label: "Protection",
    iconSrc: "/icons/dice.png",
    iconAlt: "dice",
  },
];

function MainDamageInteractionRows({ rows }: { rows: DamageInteractionRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="mt-1 border-t border-zinc-800 pt-1">
      <div className="grid grid-cols-3 overflow-hidden border border-zinc-800 text-[10px] leading-snug text-zinc-300">
        {DAMAGE_INTERACTION_GROUPS.map((group) => {
          const groupRows = rows
            .filter((row) => row.kind === group.kind)
            .sort((a, b) => a.damageType.localeCompare(b.damageType));

          return (
            <div key={group.kind} className="border-r border-zinc-800 last:border-r-0">
              <div className="flex items-center justify-center gap-1 border-b border-zinc-800 bg-zinc-950/50 px-1 py-0.5">
                <Image
                  src={group.iconSrc}
                  alt={group.iconAlt}
                  width={36}
                  height={36}
                  className="h-9 w-9 object-contain"
                />
                <span className="font-semibold text-zinc-100">{group.label}</span>
              </div>
              <div className="min-h-8 px-1 py-1 text-center text-[9px] leading-snug text-zinc-300">
                {groupRows.length > 0
                  ? groupRows.map((row) => `${row.damageType} ${formatSheetNumber(row.value)}`).join(", ")
                  : "-"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatMainTraitAttributeLine(row: MainSheetPlacementRow) {
  const cleaned = stripForgeLineLabel(row.line).trim();
  return `${row.itemName}: ${cleaned}`;
}

function characteristicSheetEffectText(
  characteristic: CharacterBuilderData["characteristics"][number],
) {
  const descriptor = renderCharacteristicDescriptor(characteristic);
  const name = characteristic.name.trim() || "Unnamed Characteristic";
  const prefix = `${name}: `;
  return descriptor.startsWith(prefix) ? descriptor.slice(prefix.length) : descriptor;
}

function MainTraitsAttributesBox({
  derivedStats,
}: {
  derivedStats: CharacterDerivedCombatStats;
}) {
  const equipmentRows = mainSheetEquipmentPlacementRows(derivedStats, MAIN_TRAIT_ATTRIBUTE_PLACEMENTS);

  if (equipmentRows.length === 0) return null;

  return (
    <section className="cb-main-traits-section border border-zinc-800 bg-black/50 p-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2 border-b border-zinc-800 pb-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Attributes
        </h3>
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-snug text-zinc-300">
        {equipmentRows.map((row) => (
          <li key={row.key}>{formatMainTraitAttributeLine(row)}</li>
        ))}
      </ul>
    </section>
  );
}

const MAIN_SHEET_STATUS_TRACKERS = [
  "Disease",
  "Freeze",
  "Horrified",
  "Immolate",
  "Keen",
  "Laceration",
  "Overwhelmed",
  "Penetrate",
  "Poisoned",
  "Shaken",
  "Smite",
  "Sundered",
  "Surge",
];
const MAIN_SHEET_STATUS_TRACKER_ROWS = [
  MAIN_SHEET_STATUS_TRACKERS.slice(0, 7),
  MAIN_SHEET_STATUS_TRACKERS.slice(7),
];

function MainSheetHelperStrip() {
  return (
    <section className="cb-main-helper-strip mt-auto border border-zinc-800 bg-black/50 p-1.5">
      <div className="space-y-0.5 text-center text-[8px] leading-tight text-zinc-300">
        {MAIN_SHEET_STATUS_TRACKER_ROWS.map((row, rowIndex) => (
          <div
            key={`status-row-${rowIndex}`}
            className={[
              "grid border border-zinc-800",
              rowIndex === 0 ? "grid-cols-7" : "grid-cols-6",
            ].join(" ")}
          >
            {row.map((status) => (
              <div key={status} className="border-r border-zinc-800 last:border-r-0">
                <div className="border-b border-zinc-800 px-1 py-0.5 font-semibold uppercase tracking-[0.06em] text-zinc-500">
                  {status}
                </div>
                <div className="flex min-h-7 items-center justify-center px-0.5 py-1">
                  <span className="inline-block h-3.5 w-3.5 border border-zinc-700" aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-[9px] leading-snug text-zinc-300">
        <p>
          <span className="font-semibold uppercase tracking-[0.06em] text-zinc-500">Start of turn:</span>{" "}
          Remove turn token. Replenish responses. Resolve any status effects or passive abilities.
        </p>
        <p>
          <span className="font-semibold uppercase tracking-[0.06em] text-zinc-500">End of turn:</span>{" "}
          Add a cooldown die to any powers you have used. Tick down any cooldown dice currently on powers, or remove if required. Mark your turn as complete with your turn token.
        </p>
      </div>
    </section>
  );
}

function MainSheetBanner({
  character,
  campaignName,
  assignedPlayerLabel,
}: {
  character: CharacterSheetCharacter;
  campaignName?: string | null;
  assignedPlayerLabel?: string | null;
}) {
  return (
    <div className="cb-main-banner grid grid-cols-[96px_minmax(0,1fr)] gap-1.5 border-2 border-zinc-800 bg-zinc-100 p-1.5 text-black">
      <div className="cb-main-banner-logo flex items-center justify-center border border-zinc-800 bg-white px-2 py-1 text-base font-black uppercase tracking-[0.16em] text-black">
        SMASH
      </div>
      <div className="grid grid-cols-4 gap-1 text-[10px] leading-tight text-black">
        <div className="cb-main-banner-field border border-zinc-800 bg-white px-1.5 py-1 text-black">
          <p className="font-bold uppercase tracking-[0.08em] text-black">Player Name</p>
          <p className="truncate font-semibold text-black">{assignedPlayerLabel?.trim() || "-"}</p>
        </div>
        <div className="cb-main-banner-field border border-zinc-800 bg-white px-1.5 py-1 text-black">
          <p className="font-bold uppercase tracking-[0.08em] text-black">Character Name</p>
          <p className="truncate font-semibold text-black">{display(character.name)}</p>
        </div>
        <div className="cb-main-banner-field border border-zinc-800 bg-white px-1.5 py-1 text-black">
          <p className="font-bold uppercase tracking-[0.08em] text-black">Power Level</p>
          <p className="font-semibold text-black">{character.level}</p>
        </div>
        <div className="cb-main-banner-field border border-zinc-800 bg-white px-1.5 py-1 text-black">
          <p className="font-bold uppercase tracking-[0.08em] text-black">Campaign Name</p>
          <p className="truncate font-semibold text-black">{campaignName?.trim() || "-"}</p>
        </div>
      </div>
    </div>
  );
}

function MainCombatSheet({
  character,
  builderData,
  derivedStats,
  compact,
  campaignName,
  assignedPlayerLabel,
}: {
  character: CharacterSheetCharacter;
  builderData: CharacterBuilderData;
  derivedStats: CharacterDerivedCombatStats;
  compact: boolean;
  campaignName?: string | null;
  assignedPlayerLabel?: string | null;
}) {
  const attackAttributeRows = mainSheetEquipmentPlacementRows(
    derivedStats,
    MAIN_ATTACK_ATTRIBUTE_PLACEMENTS,
    { lineMode: "full" },
  );
  const guardAttributeRows = mainSheetEquipmentPlacementRows(
    derivedStats,
    MAIN_GUARD_ATTRIBUTE_PLACEMENTS,
    { lineMode: "full" },
  );
  const damageInteractionRows = mainSheetDamageInteractionRows(derivedStats);
  const attackAttributeRowsBySlot = groupMainSheetRowsBySlot(attackAttributeRows);
  const attackSlots = new Set(derivedStats.attacks.map((attack) => attack.slot));
  const unmatchedAttackAttributeRows = attackAttributeRows.filter((row) => !attackSlots.has(row.slot));

  return (
    <SheetFrame
      title="Main Combat"
      subtitle="Combat table reference generated from live Character Builder data."
      className="cb-main-sheet"
      contentClassName="cb-main-sheet-content flex min-h-[calc(297mm-1.25rem)] flex-col gap-2 p-2.5"
    >
      <MainSheetBanner
        character={character}
        campaignName={campaignName}
        assignedPlayerLabel={assignedPlayerLabel}
      />

      <div className="cb-main-hero border-2 border-zinc-800 bg-black/40 p-1.5">
        <div className="cb-main-hero-grid grid grid-cols-[0.78fr_1.65fr_0.78fr] items-stretch gap-1.5">
          <CombatSide
            tone="mental"
            stats={[
              { label: "Mental Perseverance", value: derivedStats.mentalHealth },
            ]}
            attributes={["Intellect", "Synergy", "Bravery"]}
            builderData={builderData}
            derivedStats={derivedStats}
          />

          <div className="cb-identity-center flex flex-col gap-1 text-center">
            {character.archivedAt ? (
              <div className="cb-identity-band border border-amber-800 bg-zinc-950/70 p-1.5">
                <span className="text-xs text-amber-300">Archived</span>
              </div>
            ) : null}
            <div>
              <PortraitBlock character={character} className="h-[22rem]" imageClassName="h-full max-h-full" />
            </div>
          </div>

          <CombatSide
            tone="physical"
            stats={[
              { label: "Physical Resilience", value: derivedStats.physicalHealth },
            ]}
            attributes={["Attack", "Guard", "Fortitude"]}
            builderData={builderData}
            derivedStats={derivedStats}
          />
        </div>
      </div>

      <MainTraitsAttributesBox
        derivedStats={derivedStats}
      />

      <div className="grid gap-1.5">
        <MainCombatSection
          title="Attacks"
          header={<MainMetricPill label="Weapon Skill" value={derivedStats.weaponSkill} labelClassName="text-black" />}
        >
          {derivedStats.attacks.length === 0 && attackAttributeRows.length === 0 ? (
            <p className="text-sm text-zinc-500">No equipped attack output.</p>
          ) : (
            <div className="space-y-1">
              <MainAttackStringBoxes
                attacks={derivedStats.attacks}
                compact={compact}
                attackAttributeRowsBySlot={attackAttributeRowsBySlot}
              />
              <MainAttackAttributeLines
                rows={unmatchedAttackAttributeRows}
                title="Attack Attributes"
              />
            </div>
          )}
        </MainCombatSection>

        <MainCombatSection
          title="Guard / Protection"
          header={
            <div className="flex flex-wrap justify-end gap-1">
              <MainMetricPill label="Armor Skill" value={derivedStats.armorSkill} labelClassName="text-black" />
              <MainMetricPill
                label="Dodge"
                value={formatSheetNumber(derivedStats.dodgeValue)}
                labelClassName="text-black"
              />
              <MainMetricPill label="Willpower" value={derivedStats.willpower} labelClassName="text-black" />
            </div>
          }
        >
          <MainDefenceStringBoxes lines={derivedStats.defenceStrings} />
          <MainDamageInteractionRows rows={damageInteractionRows} />
          <MainGuardAttributeLines rows={guardAttributeRows} />
        </MainCombatSection>
      </div>

      <MainSheetHelperStrip />
    </SheetFrame>
  );
}

function CharacterIdentitySheet({
  character,
  builderData,
  traitSummary,
  compact,
}: {
  character: CharacterSheetCharacter;
  builderData: CharacterBuilderData;
  traitSummary: CharacterTraitSummary;
  compact: boolean;
}) {
  return (
    <SheetFrame
      title="Character Sheet"
      subtitle="Identity, narrative details, Characteristics, and Traits."
      contentClassName="space-y-3 p-4"
    >
      <div className="grid grid-cols-[0.9fr_1.25fr_0.9fr] items-stretch gap-3">
        <SheetPanel title="Description / Backstory">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {display(character.description, "No description.")}
          </p>
        </SheetPanel>

        <section className="border-2 border-zinc-800 bg-black/55 p-2 text-center">
          <div className="border border-zinc-800 bg-zinc-950/70 p-2">
            <h3 className="text-lg font-semibold uppercase tracking-[0.08em] text-zinc-100">
              {display(character.name)}
            </h3>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <StatTile label="Race" value={display(character.race, "-")} />
              <StatTile label="Age" value={display(character.age, "-")} />
              <StatTile label="Level" value={character.level} />
            </div>
          </div>
          <PortraitBlock character={character} className="mt-2 min-h-64" imageClassName="max-h-72" />
        </section>

        <SheetPanel title="Traits">
          {traitSummary.selected.length === 0 ? (
            <p className="text-sm text-zinc-500">No Traits selected.</p>
          ) : (
            <div className="grid max-h-[25rem] gap-1.5 overflow-hidden">
              {traitSummary.selected.map((trait) => (
                <div key={trait.id} className="border border-zinc-800 bg-zinc-950/50 p-1.5 text-xs text-zinc-300">
                  <div className="flex items-start justify-between gap-2 font-medium text-zinc-100">
                    <span>{trait.name}</span>
                    <span className="shrink-0 text-zinc-400">{signedTraitPointDisplay(trait)}</span>
                  </div>
                  <p className="mt-0.5 leading-snug">{trait.descriptor}</p>
                </div>
              ))}
            </div>
          )}
        </SheetPanel>
      </div>

      <div className="grid grid-cols-[1fr_0.75fr] gap-3">
        <SheetPanel title="Great Secret">
          <p className="text-sm leading-relaxed text-zinc-300">{renderGreatSecret(builderData.greatSecret)}</p>
        </SheetPanel>
        <SheetPanel title="Bonds">
          <p className="text-sm text-zinc-500">No Bonds recorded.</p>
        </SheetPanel>
      </div>

      <SheetPanel title="Characteristics">
        {builderData.characteristics.length === 0 ? (
          <p className="text-sm text-zinc-500">No Characteristics authored.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {builderData.characteristics
              .slice(0, compact ? 6 : builderData.characteristics.length)
              .map((characteristic) => (
                <section key={characteristic.id} className="border border-zinc-800 bg-zinc-950/45 p-2 text-sm text-zinc-300">
                  <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-1">
                    <h3 className="font-semibold text-zinc-100">
                      {characteristic.name.trim() || "Unnamed Characteristic"}
                    </h3>
                    {characteristic.keyword.trim() ? (
                      <span className="shrink-0 border border-zinc-800 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-zinc-400">
                        {characteristic.keyword.trim()}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 leading-relaxed">{characteristicSheetEffectText(characteristic)}</p>
                </section>
              ))}
          </div>
        )}
      </SheetPanel>

      {builderData.narrativeNotes?.trim() ? (
        <SheetPanel title="Narrative Notes">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {builderData.narrativeNotes}
          </p>
        </SheetPanel>
      ) : null}
    </SheetFrame>
  );
}

function PowerReferenceSheet({ powerBudget }: { powerBudget: CharacterPowerBudget }) {
  return (
    <SheetFrame title="Power Sheet(s)" subtitle="Power references generated from the shared descriptor and resolver output.">
      {powerBudget.powers.length === 0 ? (
        <SheetPanel title="Powers">
          <p className="text-sm text-zinc-500">No powers authored.</p>
        </SheetPanel>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {powerBudget.powers.map((summary, index) => (
            <section key={`${summary.power.name}-${index}`} className="cb-power-card border-2 border-zinc-800 bg-black/60 p-2.5">
              <div className="border-b border-zinc-800 pb-2">
                <div className="flow-root">
                  <div className={summary.costValid ? "float-right mb-1 ml-2 flex gap-1.5 text-center text-xs text-zinc-300" : "float-right mb-1 ml-2 text-xs font-medium text-red-300"}>
                    {summary.costValid ? (
                      <>
                        <span className="block min-w-16 border border-zinc-800 px-1.5 py-1">
                          <span className="block text-[9px] uppercase tracking-[0.08em] text-zinc-500">Counter</span>
                          {titleCase(summary.power.counterMode)}
                        </span>
                        <span className="block min-w-16 border border-zinc-800 px-1.5 py-1">
                          <span className="block text-[9px] uppercase tracking-[0.08em] text-zinc-500">Cooldown</span>
                          {summary.derivedCooldownTurns ?? 1}
                        </span>
                      </>
                    ) : (
                      `Invalid: ${summary.invalidCostReason ?? "Power is invalid."}`
                    )}
                  </div>
                  <h3 className="text-base font-semibold uppercase tracking-[0.04em]">
                    {summary.power.name || `Power ${index + 1}`}
                  </h3>
                  {summary.power.description?.trim() ? (
                    <p className="mt-0.5 text-xs italic leading-snug text-zinc-400">{summary.power.description}</p>
                  ) : null}
                </div>
              </div>
              {summary.descriptorLines.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
                  {summary.descriptorLines.map((line, lineIndex) => (
                    <li key={`${summary.power.name}-${lineIndex}`}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No descriptor output yet.</p>
              )}
              {summary.errors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-300">
                  {summary.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </SheetFrame>
  );
}

function InventorySheet({
  backpackItems,
  equipped,
  derivedStats,
  compact,
}: {
  backpackItems: CharacterBuilderDerivedBackpackItem[];
  equipped: EquippedEntry[];
  derivedStats: CharacterDerivedCombatStats;
  compact: boolean;
}) {
  const activeEffectRegistry = buildActiveEffectRegistry(equipped);

  return (
    <SheetFrame title="Inventory Sheet" subtitle="Equipped gear and Backpack items.">
      <SheetPanel title="Protection Summary">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="PPV"
            value={derivedStats.physicalProtection}
            helper={`${derivedStats.physicalBlockPerSuccess} block / success`}
          />
          <StatTile
            label="MPV"
            value={derivedStats.mentalProtection}
            helper={`${derivedStats.mentalBlockPerSuccess} block / success`}
          />
        </div>
      </SheetPanel>

      <SheetPanel title="Equipped Gear">
        {equipped.length === 0 ? (
          <p className="text-sm text-zinc-500">No gear equipped.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {equipped.map(({ slot, backpackItem }) => (
              <EquippedItemCompactCard
                key={slot}
                slot={slot}
                item={backpackItem}
                activeEffectRegistry={activeEffectRegistry}
              />
            ))}
          </div>
        )}
      </SheetPanel>

      <SheetPanel title="Backpack">
        {backpackItems.length === 0 ? (
          <p className="text-sm text-zinc-500">No Backpack items assigned.</p>
        ) : (
          <div className="overflow-hidden border border-zinc-800">
            <div className="grid grid-cols-[minmax(0,1.4fr)_0.8fr_0.7fr_44px] gap-2 border-b border-zinc-800 bg-zinc-900/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
              <div>Item</div>
              <div>Type</div>
              <div>Rank</div>
              <div className="text-right">Qty</div>
            </div>
            <div className="divide-y divide-zinc-800">
              {backpackItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[minmax(0,1.4fr)_0.8fr_0.7fr_44px] gap-2 px-2 py-1.5 text-xs text-zinc-300">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-100">{itemName(item)}</div>
                    {!compact && itemDescriptorPreview(item, 1)[0] ? (
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                        {itemDescriptorPreview(item, 1)[0]}
                      </div>
                    ) : null}
                  </div>
                  <div>{titleCase(item.itemTemplate.type)}</div>
                  <div>
                    {[item.itemTemplate.rarity, item.itemTemplate.level ? `L${item.itemTemplate.level}` : null]
                      .filter(Boolean)
                      .join(" / ") || "-"}
                  </div>
                  <div className="text-right">{item.quantity}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetPanel>
    </SheetFrame>
  );
}

export function CharacterSheetPreview({
  character,
  builderData,
  backpackItems,
  derivedStats,
  powerBudget,
  traitSummary,
  printType = "full-colour",
  sheets = DEFAULT_CHARACTER_SHEETS,
  mode = "preview",
  campaignName,
  assignedPlayerLabel,
  className = "",
}: CharacterSheetPreviewProps) {
  const selectedSheets = { ...DEFAULT_CHARACTER_SHEETS, ...sheets };
  const compact = printType.startsWith("compact");
  const printFriendly = printType.endsWith("print-friendly");
  const equipped = selectedEquippedItems(builderData, backpackItems);
  const previewScaleEnabled = mode === "preview";
  const {
    wrapRef: previewScaleWrapRef,
    innerRef: previewScaleInnerRef,
    scale: previewScale,
    scaledHeight: previewHeight,
  } = useScaledPreview({
    enabled: previewScaleEnabled,
    contentKey: [
      character.id,
      character.imageUrl ?? "",
      printType,
      selectedSheets.main ? "main" : "",
      selectedSheets.character ? "character" : "",
      selectedSheets.powers ? "powers" : "",
      selectedSheets.inventory ? "inventory" : "",
      backpackItems.length,
      powerBudget.powers.length,
    ].join("|"),
  });
  const previewClassName = [
    "cb-sheet-preview space-y-5",
    compact ? "cb-sheet-compact" : "cb-sheet-full",
    printFriendly ? "cb-sheet-print-friendly" : "cb-sheet-colour",
    mode === "print" ? "cb-sheet-print-mode" : "cb-sheet-live-mode",
    className,
  ].join(" ");
  const sheetsContent = (
    <>
      {selectedSheets.main ? (
        <MainCombatSheet
          character={character}
          builderData={builderData}
          derivedStats={derivedStats}
          compact={compact}
          campaignName={campaignName}
          assignedPlayerLabel={assignedPlayerLabel}
        />
      ) : null}
      {selectedSheets.character ? (
        <CharacterIdentitySheet
          character={character}
          builderData={builderData}
          traitSummary={traitSummary}
          compact={compact}
        />
      ) : null}
      {selectedSheets.powers ? <PowerReferenceSheet powerBudget={powerBudget} /> : null}
      {selectedSheets.inventory ? (
        <InventorySheet
          backpackItems={backpackItems}
          equipped={equipped}
          derivedStats={derivedStats}
          compact={compact}
        />
      ) : null}
    </>
  );
  const previewStyles = (
    <style jsx global>{`
      .cb-sheet-scale-wrap {
        width: 100%;
        max-width: 100%;
        overflow: hidden;
      }

      .cb-sheet-scale-inner {
        display: inline-block;
        width: max-content;
        max-width: none;
        transform-origin: top left;
      }

      .cb-sheet-preview {
        color: #111111;
        padding-bottom: 0.5rem;
      }

      .cb-sheet-preview.cb-sheet-print-mode {
        overflow-x: auto;
      }

      .cb-sheet-preview .cb-sheet-page {
        width: 210mm;
        min-height: 297mm;
        aspect-ratio: 210 / 297;
        box-sizing: border-box;
        margin-left: auto;
        margin-right: auto;
        border-color: #3f3f46;
        background: #ffffff;
        color: #111111;
      }

      .cb-sheet-preview .cb-main-sheet {
        border-radius: 0.375rem;
      }

      .cb-sheet-preview .cb-sheet-title-band,
      .cb-sheet-preview .cb-identity-band,
      .cb-sheet-preview .cb-power-card,
      .cb-sheet-preview .cb-stat-tile,
      .cb-sheet-preview .cb-attribute-card,
      .cb-sheet-preview .cb-main-banner,
      .cb-sheet-preview .cb-main-reference-tile,
      .cb-sheet-preview .cb-main-traits-section,
      .cb-sheet-preview .cb-main-combat-section,
      .cb-sheet-preview .cb-main-helper-strip,
      .cb-sheet-preview .cb-sheet-panel {
        border-color: #71717a;
        background: #e4e4e7;
        color: #111111;
      }

      .cb-sheet-preview .cb-main-hero,
      .cb-sheet-preview .cb-portrait {
        border-color: #71717a;
        background: #f4f4f5;
        color: #111111;
      }

      .cb-sheet-preview .cb-main-sheet .cb-main-hero,
      .cb-sheet-preview .cb-main-sheet .cb-identity-band,
      .cb-sheet-preview .cb-main-sheet .cb-main-reference-tile,
      .cb-sheet-preview .cb-main-sheet .cb-attribute-card,
      .cb-sheet-preview .cb-main-sheet .cb-main-traits-section,
      .cb-sheet-preview .cb-main-sheet .cb-main-combat-section,
      .cb-sheet-preview .cb-main-sheet .cb-main-helper-strip,
      .cb-sheet-preview .cb-main-sheet .cb-main-defence-box,
      .cb-sheet-preview .cb-main-sheet .cb-main-output-row {
        background: #f4f4f5;
      }

      .cb-sheet-preview .cb-main-sheet .cb-main-banner {
        background: #f4f4f5;
        color: #000000;
      }

      .cb-sheet-preview .cb-main-sheet .cb-main-banner-logo,
      .cb-sheet-preview .cb-main-sheet .cb-main-banner-field {
        background: #ffffff;
        color: #000000;
      }

      .cb-sheet-preview .cb-main-sheet .cb-main-banner * {
        color: #000000;
      }

      .cb-sheet-preview .cb-main-sheet .cb-main-combat-section h3,
      .cb-sheet-preview .cb-main-sheet .cb-main-traits-section h3,
      .cb-sheet-preview .cb-main-sheet .cb-main-helper-strip,
      .cb-sheet-preview .cb-main-sheet .cb-main-reference-tile,
      .cb-sheet-preview .cb-main-sheet .cb-attribute-card {
        color: #111111;
      }

      .cb-sheet-preview .border-zinc-800,
      .cb-sheet-preview .border-zinc-800\\/80 {
        border-color: #71717a;
      }

      .cb-sheet-preview .bg-black,
      .cb-sheet-preview .bg-black\\/40,
      .cb-sheet-preview .bg-black\\/50,
      .cb-sheet-preview .bg-black\\/60,
      .cb-sheet-preview .bg-zinc-900\\/70,
      .cb-sheet-preview .bg-zinc-950\\/50,
      .cb-sheet-preview .bg-zinc-950\\/60,
      .cb-sheet-preview .bg-zinc-950\\/70 {
        background: #e4e4e7;
      }

      .cb-sheet-preview .text-zinc-100,
      .cb-sheet-preview .text-zinc-200,
      .cb-sheet-preview .text-zinc-300,
      .cb-sheet-preview .text-cyan-200,
      .cb-sheet-preview .text-emerald-200 {
        color: #111111;
      }

      .cb-sheet-preview .text-zinc-400,
      .cb-sheet-preview .text-zinc-500 {
        color: #52525b;
      }

      .cb-sheet-preview .border-cyan-900\\/70,
      .cb-sheet-preview .border-emerald-900\\/70 {
        border-color: #71717a;
      }

      .cb-sheet-preview .bg-cyan-950\\/15,
      .cb-sheet-preview .bg-emerald-950\\/15 {
        background: #e4e4e7;
      }

      .cb-sheet-preview .ring-emerald-700\\/50 {
        --tw-ring-color: #71717a;
      }
    `}</style>
  );

  if (previewScaleEnabled) {
    return (
      <div
        ref={previewScaleWrapRef}
        className="cb-sheet-scale-wrap"
        style={{ height: previewHeight ? `${previewHeight}px` : undefined }}
      >
        <div
          ref={previewScaleInnerRef}
          className={`cb-sheet-scale-inner ${previewClassName}`}
          style={{ transform: `scale(${previewScale})` }}
        >
          {sheetsContent}
          {previewStyles}
        </div>
      </div>
    );
  }

  return (
    <div className={previewClassName}>
      {sheetsContent}
      {previewStyles}
    </div>
  );
}
