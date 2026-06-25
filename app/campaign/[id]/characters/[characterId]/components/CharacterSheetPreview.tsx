"use client";

import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";

import { useScaledPreview } from "@/app/summoning-circle/components/useScaledPreview";
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

export type CharacterSheetTheme = "classic" | "dark-prestige" | "dark-prestige-v2";

export type CharacterSheetKey = "main" | "character" | "powers" | "inventory";

export type CharacterSheetSelection = Record<CharacterSheetKey, boolean>;

export const CHARACTER_SHEET_PRINT_TYPE_LABELS: Record<CharacterSheetPrintType, string> = {
  "full-colour": "Full Colour Sheet",
  "full-print-friendly": "Full Print Friendly Sheet",
  "compact-colour": "Compact Colour Sheet",
  "compact-print-friendly": "Compact Print Friendly Sheet",
};

export const CHARACTER_SHEET_THEME_LABELS: Record<CharacterSheetTheme, string> = {
  classic: "Classic",
  "dark-prestige": "Dark Prestige",
  "dark-prestige-v2": "Dark Prestige V2",
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
  signatureMoveBudget?: CharacterPowerBudget | null;
  traitSummary: CharacterTraitSummary;
  printType?: CharacterSheetPrintType;
  theme?: CharacterSheetTheme;
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

function displayEquippedEffectBullet(bullet: string) {
  return bullet
    .replace(/\bPPV\b/g, "Physical Protection")
    .replace(/\bMPV\b/g, "Mental Protection");
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

function InventorySlotCard({
  slot,
  item,
  wide = false,
}: {
  slot: EquipmentSlotKey;
  item?: CharacterBuilderDerivedBackpackItem;
  wide?: boolean;
}) {
  const slotLabel = item ? equippedSlotDisplayLabel(slot, item) : EQUIPMENT_SLOT_LABELS[slot];
  const rarityLabel = item ? titleCase(item.itemTemplate.rarity) : null;
  const meta = rarityLabel && rarityLabel !== "-" ? rarityLabel : null;

  return (
    <article
      className={[
        "cb-inventory-slot-card w-fit overflow-hidden border border-zinc-700 bg-white/48 px-1 py-0.5 text-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.7)]",
        wide ? "min-w-[6.6rem] max-w-[9.5rem]" : "min-w-[4.9rem] max-w-[8.25rem]",
      ].join(" ")}
    >
      <p className="whitespace-normal text-[7.75px] font-semibold uppercase leading-[1.25] tracking-[0.06em] text-zinc-600">{slotLabel}</p>
      {item ? (
        <>
          <p className="whitespace-normal break-words text-[10.25px] font-semibold leading-[1.15]">{itemName(item)}</p>
          {meta ? <p className="truncate text-[7.5px] leading-[1.15] tracking-[0.03em] text-zinc-600">{meta}</p> : null}
        </>
      ) : (
        <p className="mt-0.5 text-[9.5px] leading-tight text-zinc-500">Empty</p>
      )}
    </article>
  );
}

function InventoryProtectionSummary({ derivedStats }: { derivedStats: CharacterDerivedCombatStats }) {
  return (
    <div className="cb-inventory-summary grid grid-cols-2 gap-2 border border-zinc-700 bg-zinc-100 p-2 text-[10px] text-zinc-950">
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-600">Physical</p>
        <p className="mt-0.5 font-semibold">
          PPV {formatSheetNumber(derivedStats.physicalProtection)}
          <span className="font-normal"> | Physical Protection: {formatSheetNumber(derivedStats.physicalBlockPerSuccess)} block/success</span>
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-600">Mental</p>
        <p className="mt-0.5 font-semibold">
          MPV {formatSheetNumber(derivedStats.mentalProtection)}
          <span className="font-normal"> | Mental Protection: {formatSheetNumber(derivedStats.mentalBlockPerSuccess)} block/success</span>
        </p>
      </div>
    </div>
  );
}

function InventoryLoadout({
  equipped,
}: {
  equipped: EquippedEntry[];
}) {
  const bySlot = new Map(equipped.map(({ slot, backpackItem }) => [slot, backpackItem]));
  const hasTwoHandedWeapon = equipped.some(
    ({ backpackItem }) =>
      backpackItem.itemTemplate.type === "WEAPON" && backpackItem.itemTemplate.size === "TWO_HANDED",
  );
  const slot = (slotKey: EquipmentSlotKey, options?: { wide?: boolean }) => (
    <InventorySlotCard
      key={slotKey}
      slot={slotKey}
      item={bySlot.get(slotKey)}
      wide={options?.wide}
    />
  );

  return (
    <div
      className="cb-inventory-loadout relative h-[18.5rem] overflow-hidden border border-zinc-700 bg-zinc-100 p-2"
      style={{
        backgroundImage:
          'linear-gradient(rgba(244,244,245,0.18), rgba(244,244,245,0.32)), url("/character-sheet/dark-prestige/Inventory_Silhouette.png")',
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% auto",
      }}
    >
      <div className="relative z-10 grid h-full grid-cols-4 grid-rows-6 gap-1.5">
        <div className="col-start-2 row-start-1 mx-2 flex translate-y-[25px] items-center justify-center">{slot("headArmor")}</div>
        <div className="col-start-3 row-start-1 mx-2 flex translate-y-[25px] items-center justify-center">{slot("headItem")}</div>
        <div className="col-start-2 col-span-2 row-start-2 mx-12 flex translate-y-[37px] items-center justify-center">{slot("neckItem")}</div>
        <div className="col-start-1 row-start-2 mx-2 flex translate-x-[25px] translate-y-[10px] items-center justify-center">{slot("shoulderArmor")}</div>
        <div className="col-start-4 row-start-2 mx-2 flex -translate-x-[25px] translate-y-[10px] items-center justify-center">{slot("armsItem")}</div>
        <div className="col-start-1 row-start-3 mx-2 flex translate-y-[25px] items-center justify-center">{slot("mainHand")}</div>
        <div className="col-start-2 col-span-2 row-start-3 mx-8 flex items-center justify-center">{slot("torsoArmor")}</div>
        {!hasTwoHandedWeapon ? (
          <div className="col-start-4 row-start-3 mx-2 flex translate-y-[25px] items-center justify-center">{slot("offHand")}</div>
        ) : null}
        <div className="col-start-2 col-span-2 row-start-4 mx-14 flex -translate-y-[15px] items-center justify-center">{slot("beltItem")}</div>
        <div className="col-start-4 row-start-4 mx-2 flex -translate-x-[25px] items-center justify-center">{slot("smallSlot")}</div>
        <div className="col-start-2 col-span-2 row-start-5 mx-16 flex -translate-y-[40px] items-center justify-center">{slot("legsArmor", { wide: true })}</div>
        <div className="col-start-2 col-span-2 row-start-6 mx-16 flex -translate-y-[50px] items-center justify-center">{slot("feetArmor", { wide: true })}</div>
      </div>
    </div>
  );
}

function InventoryEquippedEffects({
  equipped,
  activeEffectRegistry,
  className = "",
}: {
  equipped: EquippedEntry[];
  activeEffectRegistry: ActiveEffectRegistry;
  className?: string;
}) {
  const rows = equipped
    .map(({ slot, backpackItem }) => ({
      slot,
      slotLabel: equippedSlotDisplayLabel(slot, backpackItem),
      item: backpackItem,
      bullets: equippedItemBullets(slot, backpackItem, activeEffectRegistry),
    }))
    .filter((row) => row.bullets.length > 0);

  return (
    <SheetPanel title="Equipped Effects" className={className}>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No equipped effects listed.</p>
      ) : (
        <div className="cb-inventory-effects-ledger divide-y divide-zinc-800 border border-zinc-800 text-[10.25px] leading-snug text-zinc-300">
          {rows.map((row) => (
            <div
              key={`${row.slot}-${row.item.id}`}
              className="cb-inventory-effects-row grid grid-cols-[minmax(0,0.9fr)_minmax(0,2.2fr)] gap-2 bg-zinc-950/20 px-2 py-1"
            >
              <div className="min-w-0">
                <div className="text-[8.25px] font-semibold uppercase leading-tight tracking-[0.06em] text-zinc-500">
                  {row.slotLabel}
                </div>
                <div className="font-semibold leading-tight text-zinc-100">{itemName(row.item)}</div>
              </div>
              <div className="min-w-0 break-words text-zinc-300">
                {row.bullets.map(displayEquippedEffectBullet).join("; ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </SheetPanel>
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
    <div
      className={`cb-main-reference-tile cb-main-reference-tile--${tone} border border-zinc-800 bg-zinc-950/70 px-1.5 py-1 ${alignment}`}
    >
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
  const boxes = attacks.map((attack) => ({
    key: `${attack.slot}-${attack.label}`,
    label: attack.label,
    slot: attack.slot,
    slotLabel: attack.slotLabel,
    lines: attack.lines.slice(0, compact ? 3 : attack.lines.length),
  }));

  if (boxes.length === 0) return null;
  const gridClass =
    boxes.length === 1
      ? "grid grid-cols-[55%] justify-center gap-1"
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
          <div className="space-y-1">
            {box.lines.map((line, index) => (
              <p key={`${box.key}-${index}`}>
                <RenderLeadIn line={compactLine(line)} />
              </p>
            ))}
          </div>
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

function moveSpeedFeetFromFortitude(builderData: CharacterBuilderData) {
  const fortitude = builderData.attributes.Fortitude;
  return (typeof fortitude === "number" ? fortitude : 0) * 5;
}

function MainMoveSpeedCartouche({ effectiveMoveSpeedFeet }: { effectiveMoveSpeedFeet: number }) {
  return (
    <div className="cb-main-move-speed-cartouche pointer-events-none absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
      <div className="cb-main-move-speed-art absolute inset-0" aria-hidden="true" />
      <div className="cb-main-move-speed-label absolute z-10 text-center text-[7px] font-semibold uppercase leading-none tracking-[0.12em] text-zinc-400">
        Move Speed
      </div>
      <div className="cb-main-move-speed-value absolute z-10 text-center font-semibold leading-none text-zinc-100">
        <span className="cb-main-move-speed-number">{effectiveMoveSpeedFeet || "-"}</span>
        <span className="cb-main-move-speed-unit">ft</span>
      </div>
    </div>
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
      <div className="mt-1 grid grid-cols-3 gap-1 text-[9px] leading-snug text-zinc-300">
        <p>
          <span className="font-semibold uppercase tracking-[0.06em] text-zinc-500">Start of round:</span>{" "}
          Replace turn token.
        </p>
        <p>
          <span className="font-semibold uppercase tracking-[0.06em] text-zinc-500">Start of turn:</span>{" "}
          Remove turn token. Replenish responses. Resolve any status effects or passive abilities.
        </p>
        <p>
          <span className="font-semibold uppercase tracking-[0.06em] text-zinc-500">End of turn:</span>{" "}
          Add cooldown dice to powers used this turn. Tick down existing cooldowns by 1, remove any at 0.
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
    <div className="cb-main-banner relative border-2 border-zinc-800 bg-zinc-100 p-1.5 text-black">
      <div className="cb-main-banner-art pointer-events-none absolute inset-0 hidden" aria-hidden="true" />
      <div className="cb-main-banner-content relative grid grid-cols-[128px_minmax(0,1fr)] gap-1.5">
        <div
          className="cb-main-banner-logo flex items-center justify-center border border-zinc-800 bg-white px-2 py-1 text-sm font-black uppercase tracking-[0.1em] text-black"
          aria-label="Incarnate TTRPG"
        >
          <span className="cb-main-banner-logo-text">INCARNATE</span>
        </div>
        <div className="cb-main-banner-fields grid grid-cols-4 gap-1 text-[10px] leading-tight text-black">
          <div className="cb-main-banner-field border border-zinc-800 bg-white px-1.5 py-1 text-black">
            <p className="font-bold uppercase tracking-[0.08em] text-black">Player Name</p>
            <p className="truncate font-semibold text-black">{assignedPlayerLabel?.trim() || "-"}</p>
          </div>
          <div className="cb-main-banner-field border border-zinc-800 bg-white px-1.5 py-1 text-black">
            <p className="font-bold uppercase tracking-[0.08em] text-black">Campaign Name</p>
            <p className="truncate font-semibold text-black">{campaignName?.trim() || "-"}</p>
          </div>
          <div className="cb-main-banner-field border border-zinc-800 bg-white px-1.5 py-1 text-black">
            <p className="font-bold uppercase tracking-[0.08em] text-black">Character Name</p>
            <p className="truncate font-semibold text-black">{display(character.name)}</p>
          </div>
          <div className="cb-main-banner-field border border-zinc-800 bg-white px-1.5 py-1 text-black">
            <p className="font-bold uppercase tracking-[0.08em] text-black">Character Level</p>
            <p className="font-semibold text-black">{character.level}</p>
          </div>
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
  const moveSpeedFeet = moveSpeedFeetFromFortitude(builderData);

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

      <div className="cb-main-attributes-anchor relative">
        <MainMoveSpeedCartouche effectiveMoveSpeedFeet={moveSpeedFeet} />
        <MainTraitsAttributesBox
          derivedStats={derivedStats}
        />
      </div>

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
              <MainMetricPill
                label="Dodge"
                value={formatSheetNumber(derivedStats.dodgeValue)}
                labelClassName="text-black"
              />
              <MainMetricPill label="Armor Skill" value={derivedStats.armorSkill} labelClassName="text-black" />
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

const POWER_TITLE_FONT_SIZES = [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6];

function PowerCardTitle({ children }: { children: string }) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [fontSize, setFontSize] = useState(POWER_TITLE_FONT_SIZES[0]);

  useLayoutEffect(() => {
    const titleElement = titleRef.current;
    if (!titleElement) return undefined;

    const fitTitle = () => {
      const nextFontSize =
        POWER_TITLE_FONT_SIZES.find((size) => {
          titleElement.style.fontSize = `${size}px`;
          titleElement.style.whiteSpace = "nowrap";
          titleElement.style.width = "100%";
          return titleElement.scrollWidth <= titleElement.clientWidth;
        }) ?? POWER_TITLE_FONT_SIZES[POWER_TITLE_FONT_SIZES.length - 1];

      setFontSize(nextFontSize);
      titleElement.style.fontSize = `${nextFontSize}px`;
      titleElement.style.whiteSpace = "nowrap";
      titleElement.style.width = "100%";
    };

    fitTitle();
    const frameId = window.requestAnimationFrame(fitTitle);
    const fontReady = document.fonts?.ready;
    fontReady?.then(fitTitle).catch(() => undefined);

    if (typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(frameId);
    }

    const resizeObserver = new ResizeObserver(fitTitle);
    resizeObserver.observe(titleElement);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [children]);

  return (
    <h3
      ref={titleRef}
      className="block min-w-0 max-w-full overflow-hidden whitespace-nowrap font-semibold uppercase tracking-[0.04em]"
      style={{ fontSize, lineHeight: 1.18 }}
      title={children}
    >
      {children}
    </h3>
  );
}

function PowerReferenceSheet({
  powerBudget,
  signatureMoveBudget,
}: {
  powerBudget: CharacterPowerBudget;
  signatureMoveBudget?: CharacterPowerBudget | null;
}) {
  const signatureMove = signatureMoveBudget?.powers[0] ?? null;
  const renderPowerCard = (
    summary: CharacterPowerBudget["powers"][number],
    index: number,
    fallbackName: string,
    wide = false,
  ) => (
    <section
      key={`${summary.power.name}-${index}-${wide ? "signature" : "power"}`}
      className={`cb-power-card border-2 border-zinc-800 bg-black/60 p-2.5 ${wide ? "col-span-2" : ""}`}
    >
      <div className="cb-power-card-header border-b border-zinc-800 pb-2 pt-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="min-w-0 overflow-hidden">
            <PowerCardTitle>
              {summary.power.name || fallbackName}
            </PowerCardTitle>
            {summary.power.description?.trim() ? (
              <p className="mt-0.5 text-xs italic leading-snug text-zinc-400">{summary.power.description}</p>
            ) : null}
          </div>
          <div className={summary.costValid ? "flex gap-1.5 text-center text-xs text-zinc-300" : "text-xs font-medium text-red-300"}>
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
  );

  return (
    <SheetFrame
      title="Power Sheet(s)"
      subtitle="Power references generated from the shared descriptor and resolver output."
      className="cb-power-sheet"
    >
      {!signatureMove && powerBudget.powers.length === 0 ? (
        <SheetPanel title="Powers">
          <p className="text-sm text-zinc-500">No powers authored.</p>
        </SheetPanel>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {signatureMove ? renderPowerCard(signatureMove, 0, "Signature Move", true) : null}
          {powerBudget.powers.map((summary, index) => renderPowerCard(summary, index, `Power ${index + 1}`))}
        </div>
      )}
    </SheetFrame>
  );
}

function InventorySheet({
  backpackItems,
  equipped,
  derivedStats,
}: {
  backpackItems: CharacterBuilderDerivedBackpackItem[];
  equipped: EquippedEntry[];
  derivedStats: CharacterDerivedCombatStats;
}) {
  const activeEffectRegistry = buildActiveEffectRegistry(equipped);

  return (
    <SheetFrame title="Inventory Sheet" subtitle="Equipped gear and Backpack items.">
      <InventoryProtectionSummary derivedStats={derivedStats} />

      <div className="cb-inventory-loadout-effects-row grid grid-cols-[minmax(0,55fr)_minmax(0,45fr)] gap-3">
        <SheetPanel title="Equipped Loadout" className="cb-inventory-loadout-panel">
          <InventoryLoadout equipped={equipped} />
        </SheetPanel>

        <InventoryEquippedEffects
          equipped={equipped}
          activeEffectRegistry={activeEffectRegistry}
          className="cb-inventory-effects-panel"
        />
      </div>

      <SheetPanel title="Backpack">
        {backpackItems.length === 0 ? (
          <p className="text-sm text-zinc-500">No Backpack items assigned.</p>
        ) : (
          <div className="border border-zinc-800">
            <div className="cb-backpack-ledger grid grid-cols-3">
              {backpackItems.map((item) => (
                <div
                  key={item.id}
                  className="cb-backpack-entry flex min-w-0 items-center justify-between gap-2 border-b border-r border-zinc-800 px-2 py-1 text-[11px] text-zinc-300"
                >
                  <span className="truncate font-medium text-zinc-100">{itemName(item)}</span>
                  <span className="shrink-0 text-zinc-500">x{item.quantity}</span>
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
  signatureMoveBudget,
  traitSummary,
  printType = "full-colour",
  theme = "classic",
  sheets = DEFAULT_CHARACTER_SHEETS,
  mode = "preview",
  campaignName,
  assignedPlayerLabel,
  className = "",
}: CharacterSheetPreviewProps) {
  const selectedSheets = { ...DEFAULT_CHARACTER_SHEETS, ...sheets };
  const compact = printType.startsWith("compact");
  const printFriendly = printType.endsWith("print-friendly");
  const darkPrestigeFamily = theme === "dark-prestige" || theme === "dark-prestige-v2";
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
      theme,
      selectedSheets.main ? "main" : "",
      selectedSheets.character ? "character" : "",
      selectedSheets.powers ? "powers" : "",
      selectedSheets.inventory ? "inventory" : "",
      backpackItems.length,
      powerBudget.powers.length,
      signatureMoveBudget?.powers.length ?? 0,
    ].join("|"),
  });
  const previewClassName = [
    "cb-sheet-preview space-y-5",
    `character-sheet--${theme}`,
    darkPrestigeFamily ? "character-sheet--dark-prestige" : "",
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
      {selectedSheets.powers ? (
        <PowerReferenceSheet powerBudget={powerBudget} signatureMoveBudget={signatureMoveBudget} />
      ) : null}
      {selectedSheets.inventory ? (
        <InventorySheet
          backpackItems={backpackItems}
          equipped={equipped}
          derivedStats={derivedStats}
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

      .cb-sheet-preview .cb-inventory-loadout-effects-row {
        min-height: 38rem;
        align-items: stretch;
      }

      .cb-sheet-preview .cb-inventory-loadout-panel,
      .cb-sheet-preview .cb-inventory-effects-panel {
        display: flex;
        min-height: 0;
        flex-direction: column;
      }

      .cb-sheet-preview .cb-inventory-loadout-panel > div,
      .cb-sheet-preview .cb-inventory-effects-panel > div {
        min-height: 0;
        flex: 1;
      }

      .cb-sheet-preview .cb-inventory-loadout-effects-row .cb-inventory-loadout {
        height: 100%;
      }

      .cb-sheet-preview .cb-backpack-ledger .cb-backpack-entry:nth-child(3n) {
        border-right-width: 0;
      }

      .cb-sheet-preview .cb-main-move-speed-cartouche {
        width: 6.7rem;
        aspect-ratio: 3 / 2;
        color: #111111;
        filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.28));
      }

      .cb-sheet-preview .cb-main-move-speed-art {
        background: linear-gradient(180deg, #f4f4f5, #d4d4d8);
        border: 1px solid #71717a;
        clip-path: polygon(8% 35%, 14% 17%, 32% 12%, 42% 18%, 58% 18%, 68% 12%, 86% 17%, 92% 35%, 88% 58%, 65% 60%, 59% 68%, 50% 91%, 41% 68%, 35% 60%, 12% 58%);
      }

      .cb-sheet-preview .cb-main-move-speed-label,
      .cb-sheet-preview .cb-main-move-speed-value {
        left: 50%;
        width: 58%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #111111;
      }

      .cb-sheet-preview .cb-main-move-speed-label {
        top: 17%;
        height: 17%;
      }

      .cb-sheet-preview .cb-main-move-speed-value {
        top: 49%;
        height: 26%;
        font-size: 1rem;
        gap: 0.06em;
        align-items: baseline;
      }

      .cb-sheet-preview .cb-main-move-speed-unit {
        font-size: 0.7em;
        line-height: 1;
        transform: translateY(-0.02em);
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

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic {
        --classic-paper: #e9d4a8;
        --classic-paper-deep: #c49b5f;
        --classic-ink: #2b2115;
        --classic-muted: #735831;
        --classic-line: rgba(99, 73, 38, 0.5);
        --classic-line-soft: rgba(99, 73, 38, 0.2);
        --classic-panel: rgba(244, 224, 184, 0.82);
        --classic-panel-strong: rgba(238, 213, 165, 0.9);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-sheet-page {
        position: relative;
        isolation: isolate;
        border-color: transparent;
        background: url("/assets/character-sheet/Classic/classic_background.png") center / 100% 100% no-repeat;
        color: var(--classic-ink);
        box-shadow:
          0 12px 28px rgba(20, 13, 6, 0.18);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-sheet-page::before {
        content: "";
        position: absolute;
        inset: 4mm;
        z-index: 0;
        pointer-events: none;
        border: 0;
        background: none;
        opacity: 0.85;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-sheet-page::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background:
          radial-gradient(circle at 6% 6%, rgba(99, 73, 38, 0.18), transparent 8%),
          radial-gradient(circle at 94% 6%, rgba(99, 73, 38, 0.16), transparent 8%),
          radial-gradient(circle at 6% 94%, rgba(99, 73, 38, 0.14), transparent 8%),
          radial-gradient(circle at 94% 94%, rgba(99, 73, 38, 0.14), transparent 8%);
        mix-blend-mode: multiply;
        opacity: 0.55;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-sheet-page > * {
        position: relative;
        z-index: 1;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-sheet-panel,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-stat-tile,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-attribute-card,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-reference-tile,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-traits-section,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-combat-section,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-helper-strip,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-defence-box,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-output-row,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-power-card,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-inventory-summary,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-inventory-loadout,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-inventory-effects-ledger {
        border-color: var(--classic-line);
        background:
          linear-gradient(rgba(247, 229, 191, 0.84), rgba(229, 197, 137, 0.78)),
          repeating-linear-gradient(135deg, transparent 0 13px, rgba(105, 75, 37, 0.035) 13px 14px);
        color: var(--classic-ink);
        box-shadow:
          inset 0 0 0 1px rgba(255, 248, 220, 0.48),
          inset 0 -12px 24px rgba(116, 80, 36, 0.08);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-hero,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-portrait {
        border-color: var(--classic-line);
        background:
          linear-gradient(rgba(248, 231, 193, 0.78), rgba(224, 194, 136, 0.7)),
          radial-gradient(circle at 50% 45%, rgba(103, 73, 35, 0.12), transparent 58%);
        color: var(--classic-ink);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-banner {
        border-color: rgba(99, 73, 38, 0.68);
        background:
          linear-gradient(90deg, rgba(112, 77, 35, 0.12), rgba(250, 232, 194, 0.82) 18%, rgba(250, 232, 194, 0.82) 82%, rgba(112, 77, 35, 0.12)),
          linear-gradient(180deg, rgba(248, 232, 196, 0.9), rgba(222, 190, 130, 0.82));
        color: var(--classic-ink);
        box-shadow: inset 0 0 0 1px rgba(255, 248, 222, 0.5);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-banner-logo {
        position: relative;
        overflow: visible;
        border-color: rgba(99, 73, 38, 0.62);
        background: rgba(247, 229, 190, 0.66);
        color: transparent;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-banner-logo::before {
        content: "";
        position: absolute;
        inset: -0.35rem 0.35rem;
        background: url("/character-sheet/dark-prestige/IncarnateLogoTransparentNoTtrpg.png") center / contain no-repeat;
        filter: sepia(1) saturate(0.85) brightness(0.56) contrast(1.35);
        opacity: 0.9;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-banner-logo-text {
        color: transparent;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-banner-field,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-inventory-slot-card,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-inventory-effects-row {
        border-color: rgba(99, 73, 38, 0.46);
        background: rgba(248, 230, 191, 0.66);
        color: var(--classic-ink);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-sheet-panel h3,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-combat-section h3,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-main-traits-section h3,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .cb-power-card h3 {
        color: #4f371d;
        border-color: rgba(99, 73, 38, 0.45);
        font-family: Georgia, "Times New Roman", serif;
        letter-spacing: 0.1em;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .text-zinc-100,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .text-zinc-200,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .text-zinc-300,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .text-black {
        color: var(--classic-ink);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .text-zinc-400,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .text-zinc-500,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--classic .text-zinc-600 {
        color: var(--classic-muted);
      }

      .cb-sheet-preview.character-sheet--dark-prestige {
        --inc-sheet-bg: #080706;
        --inc-panel-bg: #15110d;
        --inc-panel-bg-soft: #211914;
        --inc-border: #8b5e2e;
        --inc-border-soft: #4b2f1c;
        --inc-text: #eadfc7;
        --inc-muted: #b79b6b;
        --inc-gold: #c4974d;
        --inc-bronze: #6f4628;
        --inc-ember: #c2412d;
        --inc-font-display: Georgia, "Times New Roman", serif;
        --inc-font-body: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --inc-font-label: Georgia, "Times New Roman", serif;
        color: var(--inc-text);
        font-family: var(--inc-font-body);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-page {
        position: relative;
        border-color: var(--inc-border);
        background:
          radial-gradient(circle at 50% 0%, rgba(196, 151, 77, 0.12), transparent 34%),
          linear-gradient(135deg, #080706 0%, #120d0a 52%, #080706 100%);
        color: var(--inc-text);
        box-shadow:
          inset 0 0 0 1px rgba(196, 151, 77, 0.28),
          inset 0 0 0 6px rgba(75, 47, 28, 0.34),
          0 18px 40px rgba(0, 0, 0, 0.55);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-page::before {
        content: "";
        position: absolute;
        inset: 7px;
        pointer-events: none;
        border: 1px solid rgba(196, 151, 77, 0.34);
        z-index: 0;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-page::after {
        content: "";
        position: absolute;
        inset: 12px;
        pointer-events: none;
        background:
          linear-gradient(var(--inc-gold), var(--inc-gold)) left top / 22px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) left top / 1px 22px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) 6px 6px / 12px 1px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) 6px 6px / 1px 12px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right top / 22px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right top / 1px 22px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) calc(100% - 18px) 6px / 12px 1px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) calc(100% - 7px) 6px / 1px 12px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) left bottom / 18px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) left bottom / 1px 18px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right bottom / 18px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right bottom / 1px 18px no-repeat;
        opacity: 0.44;
        z-index: 0;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet::after {
        background:
          linear-gradient(var(--inc-gold), var(--inc-gold)) left top / 22px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) left top / 1px 22px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) 6px 6px / 12px 1px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) 6px 6px / 1px 12px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right top / 22px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right top / 1px 22px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) calc(100% - 18px) 6px / 12px 1px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) calc(100% - 7px) 6px / 1px 12px no-repeat;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-page > * {
        position: relative;
        z-index: 1;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-panel,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-stat-tile,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-power-card,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-attribute-card,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner-logo,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner-field,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-hero,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-portrait,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-reference-tile,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-combat-section,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-traits-section,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-helper-strip,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-defence-box,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-output-row,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-identity-band,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-title-band {
        position: relative;
        border-color: var(--inc-border);
        background:
          linear-gradient(180deg, rgba(33, 25, 20, 0.96), rgba(16, 12, 9, 0.96));
        color: var(--inc-text);
        box-shadow:
          inset 0 0 0 1px rgba(196, 151, 77, 0.16),
          inset 0 0 18px rgba(0, 0, 0, 0.28);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-panel::before,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-power-card::before,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-combat-section::before,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-traits-section::before,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-helper-strip::before,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-hero::before {
        content: "";
        position: absolute;
        inset: 3px;
        pointer-events: none;
        border: 1px solid rgba(196, 151, 77, 0.2);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-panel::after,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-power-card::after,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-combat-section::after,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-traits-section::after {
        content: "";
        position: absolute;
        inset: 5px;
        pointer-events: none;
        background:
          linear-gradient(var(--inc-gold), var(--inc-gold)) left top / 14px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) left top / 1px 14px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right top / 14px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right top / 1px 14px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) left bottom / 14px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) left bottom / 1px 14px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right bottom / 14px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right bottom / 1px 14px no-repeat;
        opacity: 0.38;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner {
        position: relative;
        background:
          linear-gradient(90deg, rgba(75, 47, 28, 0.8), rgba(21, 17, 13, 0.96)),
          linear-gradient(180deg, var(--inc-panel-bg-soft), var(--inc-panel-bg));
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner-logo {
        color: var(--inc-gold);
        font-family: var(--inc-font-display);
        letter-spacing: 0.08em;
        text-shadow: 0 0 14px rgba(196, 151, 77, 0.32);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner-field p:first-child,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-stat-tile > div:first-child,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-reference-tile p:first-child,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-slot-card p:first-child {
        font-family: var(--inc-font-label);
        font-variant-caps: small-caps;
        letter-spacing: 0.11em;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner *,
      .cb-sheet-preview.character-sheet--dark-prestige .text-black,
      .cb-sheet-preview.character-sheet--dark-prestige .text-zinc-100,
      .cb-sheet-preview.character-sheet--dark-prestige .text-zinc-200,
      .cb-sheet-preview.character-sheet--dark-prestige .text-zinc-300,
      .cb-sheet-preview.character-sheet--dark-prestige .text-zinc-950,
      .cb-sheet-preview.character-sheet--dark-prestige .text-cyan-200,
      .cb-sheet-preview.character-sheet--dark-prestige .text-emerald-200 {
        color: var(--inc-text);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .text-zinc-400,
      .cb-sheet-preview.character-sheet--dark-prestige .text-zinc-500 {
        color: var(--inc-muted);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .border-zinc-800,
      .cb-sheet-preview.character-sheet--dark-prestige .border-zinc-800\\/80,
      .cb-sheet-preview.character-sheet--dark-prestige .border-zinc-700,
      .cb-sheet-preview.character-sheet--dark-prestige .border-cyan-900\\/70,
      .cb-sheet-preview.character-sheet--dark-prestige .border-emerald-900\\/70 {
        border-color: var(--inc-border);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .bg-black,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-black\\/40,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-black\\/50,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-black\\/60,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-zinc-900\\/70,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-zinc-950\\/35,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-zinc-950\\/50,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-zinc-950\\/60,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-zinc-950\\/70,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-cyan-950\\/15,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-emerald-950\\/15 {
        background: var(--inc-panel-bg);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .bg-white,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-white\\/75,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-zinc-100,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-zinc-300\\/35,
      .cb-sheet-preview.character-sheet--dark-prestige .bg-zinc-100\\/95 {
        background: rgba(33, 25, 20, 0.78);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-portrait {
        background:
          radial-gradient(circle at 50% 42%, rgba(196, 151, 77, 0.14), transparent 44%),
          linear-gradient(180deg, #100c09, #050403);
        box-shadow:
          inset 0 0 0 1px rgba(196, 151, 77, 0.26),
          inset 0 0 28px rgba(0, 0, 0, 0.52);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-portrait span {
        color: var(--inc-muted);
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-reference-tile .font-black,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-attribute-card .font-black {
        color: #f4e8cb;
        font-family: var(--inc-font-display);
        text-shadow:
          0 0 10px rgba(194, 65, 45, 0.28),
          0 1px 0 rgba(0, 0, 0, 0.8);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-panel h3,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-combat-section h3,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-traits-section h3,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-power-card h3 {
        color: var(--inc-gold);
        font-family: var(--inc-font-display);
        font-variant-caps: small-caps;
        letter-spacing: 0.1em;
        text-shadow: 0 0 10px rgba(196, 151, 77, 0.18);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-panel h3,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-combat-section h3,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-traits-section h3 {
        border-bottom-color: var(--inc-border-soft);
        background:
          linear-gradient(90deg, rgba(196, 151, 77, 0.22), transparent 38%),
          linear-gradient(180deg, rgba(8, 7, 6, 0.36), transparent);
        padding-left: 0.35rem;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-helper-strip {
        background:
          linear-gradient(180deg, rgba(33, 25, 20, 0.96), rgba(8, 7, 6, 0.96));
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-panel {
        background:
          linear-gradient(180deg, rgba(35, 25, 18, 0.96), rgba(16, 12, 9, 0.96));
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-sheet-panel h3 {
        border-color: var(--inc-border-soft);
        text-shadow: 0 0 10px rgba(196, 151, 77, 0.14);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-power-card h3 {
        font-size: 1.08rem;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-stat-tile > div:nth-child(2) {
        color: #f4e8cb;
        font-family: var(--inc-font-display);
        text-shadow: 0 0 8px rgba(196, 151, 77, 0.18);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-defence-box,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-output-row {
        box-shadow:
          inset 0 0 0 1px rgba(196, 151, 77, 0.12),
          inset 0 0 14px rgba(0, 0, 0, 0.2);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-summary {
        border-color: var(--inc-border);
        background:
          linear-gradient(90deg, rgba(33, 25, 20, 0.96), rgba(20, 15, 11, 0.96));
        color: var(--inc-text);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-summary p {
        color: var(--inc-text);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-loadout {
        border-color: var(--inc-border);
        background-color: var(--inc-panel-bg) !important;
        box-shadow: inset 0 0 36px rgba(0, 0, 0, 0.52);
        background-blend-mode: multiply, normal;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-slot-card {
        border-color: var(--inc-border);
        background: rgba(21, 17, 13, 0.59);
        color: var(--inc-text);
        box-shadow:
          inset 0 0 0 1px rgba(196, 151, 77, 0.14),
          0 2px 7px rgba(0, 0, 0, 0.42);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-slot-card p {
        color: var(--inc-text);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-slot-card p:first-child,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-slot-card .text-zinc-600 {
        color: var(--inc-muted);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-slot-card p:first-child {
        font-size: 9px;
        line-height: 1.25;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-slot-card p:nth-child(2) {
        font-size: 11.5px;
        line-height: 1.18;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-slot-card p:nth-child(3) {
        font-size: 8.75px;
        line-height: 1.18;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-effects-ledger {
        border-color: var(--inc-border);
        background: rgba(8, 7, 6, 0.28);
        font-size: 10.25px;
        line-height: 1.25;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-effects-row {
        border-color: var(--inc-border-soft);
        background: rgba(21, 17, 13, 0.62);
        padding-top: 0.12rem;
        padding-bottom: 0.12rem;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-inventory-effects-row span:first-child {
        font-size: 8.5px;
        line-height: 1.2;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .ring-emerald-700\\/50 {
        --tw-ring-color: rgba(196, 151, 77, 0.55);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet {
        border-color: rgba(196, 151, 77, 0.76);
        background:
          radial-gradient(circle at 50% 6%, rgba(196, 151, 77, 0.18), transparent 26%),
          radial-gradient(circle at 16% 18%, rgba(194, 65, 45, 0.08), transparent 24%),
          radial-gradient(circle at 84% 18%, rgba(194, 65, 45, 0.07), transparent 24%),
          repeating-linear-gradient(135deg, rgba(234, 223, 199, 0.018) 0 1px, transparent 1px 7px),
          linear-gradient(145deg, #080706 0%, #15100c 44%, #090706 100%);
        box-shadow:
          inset 0 0 0 1px rgba(234, 223, 199, 0.16),
          inset 0 0 0 5px rgba(75, 47, 28, 0.52),
          inset 0 0 0 8px rgba(8, 7, 6, 0.62),
          inset 0 0 46px rgba(0, 0, 0, 0.58),
          0 18px 40px rgba(0, 0, 0, 0.58);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet::before {
        inset: 7px;
        border-color: rgba(196, 151, 77, 0.42);
        border-radius: 0.5rem;
        box-shadow:
          inset 0 0 0 1px rgba(75, 47, 28, 0.72),
          inset 0 0 18px rgba(196, 151, 77, 0.08);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet::after {
        inset: 10px;
        background:
          linear-gradient(var(--inc-gold), var(--inc-gold)) left top / 42px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) left top / 1px 42px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) 8px 8px / 24px 1px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) 8px 8px / 1px 24px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right top / 42px 1px no-repeat,
          linear-gradient(var(--inc-gold), var(--inc-gold)) right top / 1px 42px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) calc(100% - 32px) 8px / 24px 1px no-repeat,
          linear-gradient(var(--inc-bronze), var(--inc-bronze)) calc(100% - 9px) 8px / 1px 24px no-repeat;
        opacity: 0.62;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet-content {
        position: relative;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner {
        overflow: hidden;
        border-width: 1px;
        border-color: rgba(196, 151, 77, 0.78);
        background:
          radial-gradient(circle at 50% -40%, rgba(234, 223, 199, 0.16), transparent 48%),
          linear-gradient(90deg, rgba(8, 7, 6, 0.9), rgba(54, 34, 21, 0.88) 48%, rgba(8, 7, 6, 0.9)),
          linear-gradient(180deg, rgba(33, 25, 20, 0.98), rgba(12, 9, 7, 0.98));
        box-shadow:
          inset 0 0 0 1px rgba(234, 223, 199, 0.16),
          inset 0 0 0 4px rgba(8, 7, 6, 0.5),
          inset 0 12px 28px rgba(196, 151, 77, 0.06),
          0 2px 10px rgba(0, 0, 0, 0.26);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner-logo,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner-field {
        border-color: rgba(196, 151, 77, 0.62);
        background:
          linear-gradient(180deg, rgba(28, 20, 14, 0.96), rgba(11, 8, 6, 0.96));
        box-shadow:
          inset 0 0 0 1px rgba(234, 223, 199, 0.1),
          inset 0 -10px 18px rgba(0, 0, 0, 0.28);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-banner-logo {
        color: #f4d68c;
        text-shadow:
          0 0 14px rgba(196, 151, 77, 0.5),
          0 1px 0 rgba(0, 0, 0, 0.9);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-hero {
        overflow: hidden;
        border-width: 1px;
        border-color: rgba(196, 151, 77, 0.72);
        background:
          radial-gradient(circle at 50% 45%, rgba(196, 151, 77, 0.1), transparent 42%),
          linear-gradient(90deg, rgba(8, 7, 6, 0.5), rgba(33, 25, 20, 0.88) 50%, rgba(8, 7, 6, 0.5)),
          linear-gradient(180deg, rgba(26, 19, 14, 0.98), rgba(10, 8, 6, 0.98));
        box-shadow:
          inset 0 0 0 1px rgba(234, 223, 199, 0.12),
          inset 0 0 42px rgba(0, 0, 0, 0.45);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-hero::before {
        inset: 5px;
        border-color: rgba(196, 151, 77, 0.3);
        box-shadow:
          inset 0 0 0 1px rgba(75, 47, 28, 0.5),
          inset 0 0 20px rgba(0, 0, 0, 0.28);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-identity-center {
        position: relative;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-identity-center::before {
        content: "";
        position: absolute;
        inset: 0.35rem 0.45rem;
        pointer-events: none;
        border-left: 1px solid rgba(196, 151, 77, 0.2);
        border-right: 1px solid rgba(196, 151, 77, 0.2);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-portrait {
        border-width: 2px;
        border-color: rgba(196, 151, 77, 0.76);
        background:
          linear-gradient(90deg, rgba(8, 7, 6, 0.92), transparent 12%, transparent 88%, rgba(8, 7, 6, 0.92)),
          radial-gradient(circle at 50% 44%, rgba(196, 151, 77, 0.16), transparent 52%),
          linear-gradient(180deg, #15100c, #050403);
        box-shadow:
          inset 0 0 0 1px rgba(234, 223, 199, 0.18),
          inset 0 0 0 6px rgba(8, 7, 6, 0.52),
          inset 0 0 34px rgba(0, 0, 0, 0.6),
          0 0 0 1px rgba(75, 47, 28, 0.76),
          0 6px 18px rgba(0, 0, 0, 0.38);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-portrait img {
        filter: saturate(0.92) contrast(1.05);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-combat-side {
        align-content: stretch;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-reference-tile,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-attribute-card {
        border-color: rgba(196, 151, 77, 0.58);
        background:
          linear-gradient(90deg, rgba(196, 151, 77, 0.08), transparent 18%, transparent 82%, rgba(196, 151, 77, 0.06)),
          linear-gradient(180deg, rgba(31, 23, 17, 0.98), rgba(12, 9, 7, 0.98));
        box-shadow:
          inset 0 0 0 1px rgba(234, 223, 199, 0.08),
          inset 0 0 16px rgba(0, 0, 0, 0.32);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-reference-tile {
        box-shadow:
          inset 0 0 0 1px rgba(234, 223, 199, 0.1),
          inset 0 0 20px rgba(0, 0, 0, 0.36),
          0 1px 0 rgba(196, 151, 77, 0.16);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-reference-tile .text-4xl,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-attribute-card .text-\\[2\\.1rem\\] {
        color: #f7e6bf;
        font-family: var(--inc-font-display);
        text-shadow:
          0 0 12px rgba(194, 65, 45, 0.2),
          0 1px 0 rgba(0, 0, 0, 0.95);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-attribute-card > div:first-child {
        border-bottom-color: rgba(196, 151, 77, 0.42);
        color: #efd9a7;
        font-family: var(--inc-font-label);
        font-variant-caps: small-caps;
        text-shadow: 0 0 8px rgba(196, 151, 77, 0.12);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-main-traits-section,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-main-helper-strip {
        border-color: rgba(196, 151, 77, 0.66);
        background:
          radial-gradient(circle at 50% 0%, rgba(196, 151, 77, 0.08), transparent 42%),
          linear-gradient(180deg, rgba(30, 22, 16, 0.98), rgba(11, 8, 6, 0.98));
        box-shadow:
          inset 0 0 0 1px rgba(234, 223, 199, 0.08),
          inset 0 0 20px rgba(0, 0, 0, 0.32);
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section > div:first-child {
        position: relative;
        border-bottom-color: rgba(196, 151, 77, 0.48);
        background:
          linear-gradient(90deg, rgba(196, 151, 77, 0.2), rgba(196, 151, 77, 0.04) 38%, transparent);
        margin: -0.1rem -0.1rem 0;
        padding-left: 0.35rem;
        padding-right: 0.35rem;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section h3,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-main-traits-section h3 {
        color: #f0d89a;
        letter-spacing: 0.16em;
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-main-defence-box,
      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-main-output-row {
        border-color: rgba(196, 151, 77, 0.46);
        background:
          linear-gradient(180deg, rgba(22, 16, 12, 0.98), rgba(10, 8, 6, 0.98));
      }

      .cb-sheet-preview.character-sheet--dark-prestige .cb-main-sheet .cb-main-helper-strip {
        background:
          linear-gradient(90deg, rgba(75, 47, 28, 0.28), transparent 18%, transparent 82%, rgba(75, 47, 28, 0.28)),
          linear-gradient(180deg, rgba(26, 19, 14, 0.98), rgba(8, 7, 6, 0.98));
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet {
        border-color: transparent;
        background:
          radial-gradient(circle at 50% 3%, rgba(219, 172, 91, 0.14), transparent 20%),
          radial-gradient(circle at 50% 55%, rgba(194, 65, 45, 0.075), transparent 40%),
          repeating-linear-gradient(135deg, rgba(234, 223, 199, 0.022) 0 1px, transparent 1px 8px),
          linear-gradient(145deg, #070605 0%, #17100b 42%, #0b0806 100%);
        box-shadow:
          inset 0 0 0 1px rgba(245, 220, 165, 0.16),
          inset 0 0 0 5px rgba(5, 4, 3, 0.58),
          inset 0 0 50px rgba(0, 0, 0, 0.64),
          0 20px 44px rgba(0, 0, 0, 0.62);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-sheet-page {
        border-color: transparent;
        background: url("/assets/character-sheet/dark-prestige/dark_prestigue_background.png") center / 100% 100% no-repeat;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-sheet-page::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-sheet-page::after {
        content: none;
        display: none;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet::before {
        content: none;
        display: none;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet::after {
        content: none;
        display: none;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner {
        --dp-main-banner-flow-height: 3.25rem;
        --dp-main-banner-art-left: 17.4%;
        --dp-main-banner-art-right: calc(-0.9rem + 5px);
        --dp-main-banner-art-top: calc(-1.08rem - 6.5px);
        --dp-main-banner-art-height: calc(5.65rem + 5px);
        --dp-main-banner-fields-left-nudge: 25px;
        --dp-main-banner-fields-right: -0.15rem;
        --dp-main-banner-fields-top: 0.5rem;
        --dp-main-banner-fields-height: 2.82rem;
        --dp-main-banner-logo-top: calc(-0.45rem - 12px);
        --dp-main-banner-logo-left: 25px;
        --dp-main-banner-logo-width: 12.13%;
        --dp-main-banner-logo-height: 5.51rem;
        height: var(--dp-main-banner-flow-height);
        min-height: var(--dp-main-banner-flow-height);
        overflow: visible;
        z-index: 10;
        border-color: transparent;
        border-radius: 0;
        padding: 0;
        background:
          linear-gradient(90deg, rgba(5, 4, 3, 0.2), rgba(39, 26, 17, 0.12) 50%, rgba(5, 4, 3, 0.2)),
          linear-gradient(180deg, rgba(18, 13, 9, 0.6), rgba(8, 6, 4, 0.7));
        box-shadow: none;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-art {
        /* Four-field strip asset layer; sheet data remains real HTML above it. */
        display: block;
        left: var(--dp-main-banner-art-left);
        right: var(--dp-main-banner-art-right);
        top: var(--dp-main-banner-art-top);
        bottom: auto;
        height: var(--dp-main-banner-art-height);
        z-index: 3;
        background-image:
          var(--inc-main-banner-frame-image, url("/character-sheet/dark-prestige/header-frame.png"));
        background-position: center;
        background-repeat: no-repeat;
        background-size: 100% 100%;
        opacity: 0.96;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-art::after {
        content: "";
        position: absolute;
        left: 44.66%;
        top: 3.19%;
        width: 11.96%;
        height: 47.85%;
        pointer-events: none;
        background: url("/character-sheet/dark-prestige/header-star-overlay.png") center / contain no-repeat;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-content {
        display: block;
        position: relative;
        height: 100%;
        gap: 0;
        z-index: 20;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-fields {
        position: absolute;
        left: calc(var(--dp-main-banner-art-left) + var(--dp-main-banner-fields-left-nudge));
        right: var(--dp-main-banner-fields-right);
        top: var(--dp-main-banner-fields-top);
        height: var(--dp-main-banner-fields-height);
        z-index: 30;
        gap: 0;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin-top: 0;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-logo {
        position: absolute;
        left: var(--dp-main-banner-logo-left);
        top: var(--dp-main-banner-logo-top);
        z-index: 40;
        width: var(--dp-main-banner-logo-width);
        height: var(--dp-main-banner-logo-height);
        border-width: 0;
        border-color: transparent;
        color: #f2d38c;
        letter-spacing: 0.12em;
        overflow: visible;
        background: transparent;
        box-shadow: none;
        pointer-events: none;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-logo::before {
        content: "";
        position: absolute;
        inset: -10px 0 0;
        pointer-events: none;
        background: url("/character-sheet/dark-prestige/IncarnateLogoTransparentNoTtrpg.png") center 42% / 116% auto no-repeat;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-logo-text {
        color: transparent;
        text-shadow: none;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-field {
        display: grid;
        align-content: center;
        border-width: 0;
        border-color: transparent;
        background: transparent;
        box-shadow: none;
        padding: 0 9%;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-field p:first-child {
        color: rgba(183, 155, 107, 0.92);
        font-size: 8.5px;
        line-height: 1;
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.9);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-banner-field p:last-child {
        color: #f1e3c7;
        font-size: 14px;
        line-height: 1.05;
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.95);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-hero {
        border-color: rgba(219, 172, 91, 0.76);
        background:
          linear-gradient(90deg, rgba(5, 4, 3, 0.72), rgba(35, 25, 18, 0.9) 45%, rgba(35, 25, 18, 0.9) 55%, rgba(5, 4, 3, 0.72)),
          radial-gradient(circle at 50% 42%, rgba(219, 172, 91, 0.12), transparent 45%),
          linear-gradient(180deg, rgba(28, 19, 13, 0.98), rgba(7, 5, 4, 0.98));
        box-shadow:
          inset 0 0 0 1px rgba(245, 220, 165, 0.12),
          inset 0 0 46px rgba(0, 0, 0, 0.52);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-move-speed-cartouche {
        width: 6.85rem;
        border: 0;
        clip-path: none;
        background: none;
        filter: drop-shadow(0 4px 7px rgba(0, 0, 0, 0.62));
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-move-speed-art {
        border: 0;
        clip-path: none;
        background: url("/assets/character-sheet/dark-prestige/move-speed-cartouche.png") center / contain no-repeat;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-move-speed-label {
        top: calc(16% + 5px);
        height: 17%;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-move-speed-value {
        color: #f1e3c7;
        top: 50%;
        height: 25%;
        font-size: 0.96rem;
        gap: 0.04em;
        text-shadow:
          0 1px 0 rgba(0, 0, 0, 0.95),
          0 0 8px rgba(194, 65, 45, 0.32);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-move-speed-label {
        color: rgba(196, 151, 77, 0.88);
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.95);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet .cb-portrait {
        border-color: rgba(219, 172, 91, 0.82);
        background:
          linear-gradient(90deg, rgba(5, 4, 3, 0.95), transparent 10%, transparent 90%, rgba(5, 4, 3, 0.95)),
          radial-gradient(circle at 50% 44%, rgba(219, 172, 91, 0.18), transparent 54%),
          linear-gradient(180deg, #17100b, #040302);
        box-shadow:
          inset 0 0 0 1px rgba(245, 220, 165, 0.18),
          inset 0 0 0 6px rgba(5, 4, 3, 0.62),
          inset 0 0 38px rgba(0, 0, 0, 0.68),
          0 0 0 1px rgba(118, 80, 50, 0.82),
          0 7px 18px rgba(0, 0, 0, 0.42);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-reference-tile,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet .cb-attribute-card {
        border-color: rgba(185, 128, 70, 0.68);
        background:
          linear-gradient(90deg, rgba(219, 172, 91, 0.1), transparent 20%, transparent 80%, rgba(219, 172, 91, 0.08)),
          linear-gradient(180deg, rgba(32, 22, 15, 0.98), rgba(10, 7, 5, 0.98));
        box-shadow:
          inset 0 0 0 1px rgba(245, 220, 165, 0.09),
          inset 0 0 18px rgba(0, 0, 0, 0.38);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-reference-tile .text-4xl,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet .cb-attribute-card .text-\\[2\\.1rem\\] {
        color: #f7dfaa;
        text-shadow:
          0 0 14px rgba(194, 65, 45, 0.22),
          0 1px 0 rgba(0, 0, 0, 1);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet .cb-main-traits-section,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet .cb-main-helper-strip {
        border-color: rgba(185, 128, 70, 0.72);
        background:
          linear-gradient(90deg, rgba(111, 70, 40, 0.18), transparent 16%, transparent 84%, rgba(111, 70, 40, 0.18)),
          radial-gradient(circle at 50% 0%, rgba(219, 172, 91, 0.09), transparent 42%),
          linear-gradient(180deg, rgba(28, 19, 13, 0.98), rgba(9, 6, 5, 0.98));
        box-shadow:
          inset 0 0 0 1px rgba(245, 220, 165, 0.08),
          inset 0 0 22px rgba(0, 0, 0, 0.38);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section > div:first-child {
        border-bottom-color: rgba(219, 172, 91, 0.54);
        background:
          linear-gradient(90deg, rgba(219, 172, 91, 0.18), rgba(219, 172, 91, 0.05) 42%, transparent);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section h3,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-sheet .cb-main-traits-section h3,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-sheet-panel h3,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-power-card h3 {
        color: #f0d89a;
        letter-spacing: 0.13em;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-defence-box,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-main-output-row {
        border-color: rgba(166, 111, 60, 0.62);
        background:
          linear-gradient(180deg, rgba(24, 17, 12, 0.98), rgba(8, 6, 4, 0.98));
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-inventory-slot-card p:first-child {
        font-size: 9.4px;
        line-height: 1.28;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-inventory-slot-card p:nth-child(2) {
        font-size: 12px;
        line-height: 1.2;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-inventory-slot-card p:nth-child(3) {
        font-size: 9.1px;
        line-height: 1.2;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-inventory-effects-ledger {
        font-size: 10.6px;
        line-height: 1.3;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige .cb-inventory-effects-row {
        padding-top: 0.16rem;
        padding-bottom: 0.16rem;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-page {
        border-color: transparent;
        background: url("/assets/character-sheet/dark-prestige/dark_prestigue_background_v2.png") center / 106% 102% no-repeat;
        box-shadow: none;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-page::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-page::after,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-panel::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-panel::after,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-card::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-card::after,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner::after,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-hero::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-identity-center::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-combat-section::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-combat-section::after,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-traits-section::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-traits-section::after,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-helper-strip::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet::before,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet::after,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-art::after {
        content: none;
        display: none;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-art,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-move-speed-art {
        display: none;
        background: none;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-panel,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-stat-tile,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-card,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-attribute-card,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-logo,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-field,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-hero,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-portrait,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-reference-tile,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-combat-section,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-traits-section,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-helper-strip,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-defence-box,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-output-row,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-identity-band,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-title-band,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-inventory-summary,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-inventory-loadout,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-inventory-slot-card,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-inventory-effects-ledger,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-inventory-effects-row,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-combat-section > div:first-child,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-attribute-card > div:first-child {
        border-color: transparent !important;
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
        outline: none !important;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet :where(.border, .border-t, .border-b, .border-l, .border-r),
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-panel :where(.border, .border-t, .border-b, .border-l, .border-r) {
        border-color: transparent !important;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet :where(.bg-black, .bg-black\/40, .bg-black\/50, .bg-black\/60, .bg-zinc-950\/35, .bg-zinc-950\/45, .bg-zinc-950\/50, .bg-zinc-950\/60, .bg-zinc-950\/70),
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-panel :where(.bg-black, .bg-black\/40, .bg-black\/50, .bg-black\/60, .bg-zinc-950\/35, .bg-zinc-950\/45, .bg-zinc-950\/50, .bg-zinc-950\/60, .bg-zinc-950\/70) {
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-attribute-card,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-traits-section,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-combat-section,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-helper-strip,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-defence-box,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-output-row,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-combat-section > div:first-child,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-output-row > div:first-child,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-attribute-card > div:first-child,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-sheet-panel section {
        border-color: transparent !important;
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
        outline: none !important;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-reference-tile {
        position: relative;
        overflow: visible;
        min-height: 4.9rem;
        padding: 0.95rem 0.95rem 0.8rem;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-reference-tile::after {
        content: "";
        position: absolute;
        inset: -0.45rem -0.35rem;
        z-index: 0;
        pointer-events: none;
        background: url("/assets/character-sheet/dark-prestige/Health_Pool_Frame.png") center / 100% 100% no-repeat;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-reference-tile > * {
        position: relative;
        z-index: 1;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-reference-tile .text-4xl {
        display: block;
        transform: translateY(-4px);
        text-align: center;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-main-reference-tile > div:first-child {
        text-align: center;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-hero {
        min-height: calc(22rem + 0.75rem);
        display: flex;
        align-items: flex-end;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-hero-grid {
        width: 100%;
        align-items: end;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-identity-center {
        justify-content: flex-end;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-portrait {
        height: 18.7rem !important;
        min-height: 18.7rem;
        position: relative;
        overflow: visible;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-portrait::after {
        content: "";
        position: absolute;
        inset: -0.42rem;
        z-index: 3;
        pointer-events: none;
        background: url("/assets/character-sheet/dark-prestige/portrait-frame.png") center / 100% 100% no-repeat;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-portrait img,
      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-sheet .cb-portrait span {
        position: relative;
        z-index: 1;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-combat-side {
        align-self: end;
        height: 18.7rem;
        min-height: 18.7rem;
        grid-template-rows: auto repeat(3, minmax(0, 1fr));
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner {
        transform: translateY(2rem);
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-content {
        height: 100%;
        overflow: visible;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-logo {
        left: 50%;
        top: -1.55rem;
        width: 11.4rem;
        height: 6.35rem;
        transform: translateX(-50%);
        z-index: 50;
        overflow: visible !important;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-logo::before {
        inset: -1.5rem -1rem -1.15rem;
        background-position: center;
        background-size: contain;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-fields {
        left: 2.35rem;
        right: 2.35rem;
        top: calc(0.38rem + 10px);
        height: 2.7rem;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 10.5rem minmax(0, 1fr) minmax(0, 1fr);
        column-gap: 0.85rem;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-field:nth-child(1) {
        grid-column: 1;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-field:nth-child(2) {
        grid-column: 2;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-field:nth-child(3) {
        grid-column: 4;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-field:nth-child(4) {
        grid-column: 5;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-field {
        justify-items: center;
        padding: 0 5%;
        text-align: center;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-field p:first-child {
        font-size: 9.8px;
        line-height: 1.02;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-main-banner-field p:last-child {
        font-size: 16.1px;
        line-height: 1.04;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet > div {
        padding: 1.95rem 1.85rem !important;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet .cb-power-card {
        position: relative;
        overflow: visible;
        min-height: 10.6rem;
        padding: 1.2rem 1.35rem 1.15rem !important;
        border-color: transparent !important;
        background: rgba(10, 8, 6, 0.24) !important;
        box-shadow: none !important;
        font-size: 90%;
        line-height: 1.35;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet .cb-power-card::before {
        content: "";
        display: block;
        position: absolute;
        inset: -0.38rem;
        z-index: 0;
        pointer-events: none;
        background: url("/assets/character-sheet/dark-prestige/Ornate_frame.png") center / 100% 100% no-repeat;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet .cb-power-card > * {
        position: relative;
        z-index: 1;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet .cb-power-card > div:first-child {
        padding-top: 0.38rem;
        padding-bottom: 0.45rem;
        border-color: rgba(196, 151, 77, 0.28) !important;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet .cb-power-card h3 {
        font-size: 0.92rem;
        line-height: 1.12;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet .cb-power-card p {
        font-size: 0.68rem;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet .cb-power-card ul {
        margin-top: 0.45rem;
        font-size: 0.79rem;
        line-height: 1.4;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet .cb-power-card li {
        padding-right: 0.15rem;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-power-sheet .cb-power-card .float-right span {
        min-width: 3.25rem;
        padding: 0.25rem 0.35rem;
        border-color: rgba(196, 151, 77, 0.32) !important;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-inventory-loadout {
        background-image:
          linear-gradient(rgba(244,244,245,0.18), rgba(244,244,245,0.32)),
          url("/character-sheet/dark-prestige/Inventory_Silhouette.png") !important;
        background-position: center top !important;
        background-repeat: no-repeat !important;
        background-size: 100% calc(100% + 5px) !important;
      }

      .cb-sheet-preview.cb-sheet-colour.character-sheet--dark-prestige-v2 .cb-inventory-loadout .cb-inventory-slot-card {
        border-color: rgba(196, 151, 77, 0.64) !important;
        background:
          linear-gradient(180deg, rgba(24, 18, 12, 0.78), rgba(9, 7, 5, 0.78)) !important;
        box-shadow:
          inset 0 0 0 1px rgba(245, 220, 165, 0.1),
          0 4px 9px rgba(0, 0, 0, 0.36) !important;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-page,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-panel,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-stat-tile,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-power-card,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-attribute-card,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner-logo,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner-field,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-hero,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-portrait,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-reference-tile,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-combat-section,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-traits-section,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-helper-strip,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-defence-box,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-output-row,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-identity-band,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-title-band,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-summary,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-loadout,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-slot-card,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-effects-ledger,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-effects-row,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section > div:first-child,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet .cb-attribute-card > div:first-child {
        border-color: #a1a1aa;
        background: #ffffff;
        box-shadow: none;
        color: #18181b;
        text-shadow: none;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-title-band,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner-logo,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner-field,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section > div:first-child {
        background: #f4f4f5;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-page::before,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-page::after,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-panel::before,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-panel::after,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-power-card::before,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-power-card::after,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner::before,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner::after,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-hero::before,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-identity-center::before,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-combat-section::before,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-combat-section::after,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-traits-section::before,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-traits-section::after,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-helper-strip::before {
        content: none;
        display: none;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige *,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .text-black,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .text-zinc-100,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .text-zinc-200,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .text-zinc-300,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .text-zinc-400,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .text-zinc-500,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .text-zinc-950,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section h3,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet .cb-main-traits-section h3,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet .cb-attribute-card > div:first-child,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-reference-tile .text-4xl,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet .cb-attribute-card .text-\\[2\\.1rem\\] {
        color: #18181b;
        text-shadow: none;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-page {
        border-color: #3f3f46;
        background: #ffffff;
        outline: 1px solid #71717a;
        outline-offset: -7px;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-page::before {
        content: "";
        display: block;
        position: absolute;
        inset: 11px;
        pointer-events: none;
        border: 1px solid #a8a29e;
        z-index: 0;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-page::after {
        content: "";
        display: block;
        position: absolute;
        inset: 16px;
        pointer-events: none;
        background:
          linear-gradient(#52525b, #52525b) left top / 30px 1px no-repeat,
          linear-gradient(#52525b, #52525b) left top / 1px 30px no-repeat,
          linear-gradient(#52525b, #52525b) right top / 30px 1px no-repeat,
          linear-gradient(#52525b, #52525b) right top / 1px 30px no-repeat,
          linear-gradient(#52525b, #52525b) left bottom / 30px 1px no-repeat,
          linear-gradient(#52525b, #52525b) left bottom / 1px 30px no-repeat,
          linear-gradient(#52525b, #52525b) right bottom / 30px 1px no-repeat,
          linear-gradient(#52525b, #52525b) right bottom / 1px 30px no-repeat;
        z-index: 0;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet::after {
        background:
          linear-gradient(#52525b, #52525b) left top / 30px 1px no-repeat,
          linear-gradient(#52525b, #52525b) left top / 1px 30px no-repeat,
          linear-gradient(#52525b, #52525b) right top / 30px 1px no-repeat,
          linear-gradient(#52525b, #52525b) right top / 1px 30px no-repeat;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-title-band {
        border-color: #3f3f46;
        background: #f4f4f5;
        outline: 1px solid #a8a29e;
        outline-offset: -4px;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner-logo,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-banner-field {
        border-color: #52525b;
        background: #ffffff;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-panel,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-power-card,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-hero,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-combat-section,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-traits-section,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-helper-strip,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-summary,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-loadout,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-effects-ledger {
        border-color: #52525b;
        background: #ffffff;
        outline: 1px solid #d4d4d8;
        outline-offset: -4px;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-reference-tile,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-attribute-card,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-stat-tile,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-defence-box,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-output-row,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-slot-card,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-inventory-effects-row {
        border-color: #71717a;
        background: #ffffff;
      }

      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet .cb-main-combat-section > div:first-child,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-sheet .cb-attribute-card > div:first-child,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-sheet-panel h3,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-combat-section h3,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-main-traits-section h3,
      .cb-sheet-preview.cb-sheet-print-friendly.character-sheet--dark-prestige .cb-power-card h3 {
        border-color: #71717a;
        background: transparent;
        color: #18181b;
        font-family: var(--inc-font-label);
        font-variant-caps: small-caps;
        letter-spacing: 0.1em;
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
