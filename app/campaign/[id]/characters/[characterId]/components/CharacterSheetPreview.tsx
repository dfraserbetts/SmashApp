import type React from "react";

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

function itemMeta(item: CharacterBuilderDerivedBackpackItem) {
  return [
    item.itemTemplate.type,
    item.itemTemplate.rarity,
    item.itemTemplate.level ? `Level ${item.itemTemplate.level}` : null,
    item.itemTemplate.size ?? item.itemTemplate.armorLocation ?? item.itemTemplate.itemLocation,
    `Qty ${item.quantity}`,
  ]
    .filter(Boolean)
    .join(" / ");
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

  const standaloneGreaterSuccessMatch = withoutPeriod.match(
    /^Each greater success inflicts (.+)$/i,
  );
  if (standaloneGreaterSuccessMatch) {
    return compactGreaterSuccessClause(standaloneGreaterSuccessMatch[1]) ?? cleaned;
  }

  const weaponMatch = withoutPeriod.match(
    /^Choose (.+) and roll weapon skill dice\. This weapon inflicts (\d+) (?:physical|mental) ([A-Za-z ]+) wounds? per success(?:\. Each greater success inflicts (.+))?$/i,
  );
  if (weaponMatch) {
    const range = compactWeaponRange(weaponMatch[1]);
    const base = `${range} - ${weaponMatch[2]} ${compactDamageType(weaponMatch[3])} wounds`;
    const greaterSuccess = weaponMatch[4] ? compactGreaterSuccessClause(weaponMatch[4]) : null;
    return greaterSuccess ? `${base} / ${greaterSuccess}` : base;
  }

  return cleaned;
}

function equippedItemBullets(item: CharacterBuilderDerivedBackpackItem) {
  const template = item.itemTemplate;
  const bullets: string[] = [];

  for (const modifier of template.globalAttributeModifiers ?? []) {
    const bullet = formatCompactModifier(modifier.attribute, modifier.amount);
    if (bullet) bullets.push(bullet);
  }

  for (const section of template.descriptorSections ?? []) {
    for (const line of section.lines) {
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
}: {
  slot: EquipmentSlotKey;
  item: CharacterBuilderDerivedBackpackItem;
}) {
  const template = item.itemTemplate;
  const palette = getForgeRarityPalette(template.rarity);
  const slotLabel = EQUIPMENT_SLOT_LABELS[slot];
  const meta = itemMeta(item);
  const imageUrl = isHttpUrl(template.itemUrl) ? template.itemUrl?.trim() : null;
  const bullets = equippedItemBullets(item);

  return (
    <article
      className={`space-y-2 overflow-hidden rounded border p-2 ${palette.panelBorderClass} ${palette.panelShadowClass}`}
      style={{
        backgroundImage: palette.backgroundImage,
        borderColor: palette.panelBorderColor,
      }}
    >
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500">{slotLabel}</p>
        <p
          className={`truncate text-sm ${palette.nameTextClass}`}
          style={{ color: palette.headerColor }}
        >
          {itemName(item)}
          {meta ? ` - ${meta}` : ""}
        </p>
      </div>
      <div
        className={`grid h-[180px] grid-cols-[minmax(92px,42%)_1fr] gap-3 overflow-hidden rounded border p-2 ${palette.panelBorderClass} ${palette.panelShadowClass}`}
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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      aria-label={subtitle ? `${title}: ${subtitle}` : title}
      className={[
        "cb-sheet-page overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm",
        className,
      ].join(" ")}
    >
      <div className="space-y-3 p-3 sm:p-4">{children}</div>
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
  const effective = baseNumber + modifier;
  const resist = builderData.resistPoints[attribute] ?? 0;
  const toneClass =
    tone === "mental"
      ? "border-cyan-900/70 bg-cyan-950/15"
      : tone === "physical"
        ? "border-emerald-900/70 bg-emerald-950/15"
        : "border-zinc-800 bg-zinc-950/60";

  return (
    <div className={`cb-attribute-card border px-2 py-1 ${toneClass}`}>
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-0.5">
        <div className="text-[11px] font-semibold leading-tight text-zinc-100">{attribute}</div>
        <div className="text-right text-xl font-semibold leading-none text-zinc-100">
          {baseNumber ? effective : "-"}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1 text-center text-[9px] leading-tight text-zinc-400">
        <div>
          <p className="uppercase tracking-[0.08em] text-zinc-500">Base</p>
          <p className="text-zinc-200">{base || "-"}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.08em] text-zinc-500">Gear</p>
          <p className="text-zinc-200">{modifier ? signed(modifier) : "-"}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.08em] text-zinc-500">Resist</p>
          <p className="text-zinc-200">+{resist}</p>
        </div>
      </div>
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
    <div className="cb-combat-side grid gap-1.5">
      <div className="grid gap-1.5">
        {stats.map((stat) => (
          <div key={stat.label} className="cb-main-reference-tile border border-zinc-800 bg-zinc-950/70 px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-[0.08em] text-zinc-500">{stat.label}</div>
            <div className="mt-0.5 text-xl font-semibold leading-none text-zinc-100">{stat.value}</div>
            {stat.helper ? <div className="mt-0.5 text-[10px] text-zinc-500">{stat.helper}</div> : null}
          </div>
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
    <section className="cb-main-combat-section border border-zinc-800 bg-black/50 p-2">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{title}</h3>
        {header}
      </div>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function MainMetricPill({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-950/50 px-1.5 py-0.5 text-[10px] leading-tight text-zinc-300">
      <span className="uppercase tracking-[0.08em] text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-100">{value}</span>
    </span>
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
  return (
    <SheetFrame
      title="Main Combat"
      subtitle="Combat table reference generated from live Character Builder data."
    >
      <div className="cb-main-hero border-2 border-zinc-800 bg-black/40 p-2">
        <div className="grid grid-cols-1 items-stretch gap-2 lg:grid-cols-[1fr_1.18fr_1fr]">
          <CombatSide
            tone="mental"
            stats={[
              { label: "Mental Perseverance", value: derivedStats.mentalHealth },
            ]}
            attributes={["Intellect", "Synergy", "Bravery"]}
            builderData={builderData}
            derivedStats={derivedStats}
          />

          <div className="cb-identity-center flex flex-col gap-1.5 text-center">
            <div className="cb-identity-band border border-zinc-800 bg-zinc-950/70 p-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                {campaignName || "Character"}
              </div>
              <h1 className="mt-0.5 text-xl font-semibold uppercase leading-tight tracking-[0.04em]">
                {display(character.name)}
              </h1>
              <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] leading-tight text-zinc-300">
                <span className="border border-zinc-800 px-1.5 py-0.5">Level {character.level}</span>
                <span className="border border-zinc-800 px-1.5 py-0.5">
                  {display(character.race, "Race unset")}
                </span>
                <span className="border border-zinc-800 px-1.5 py-0.5">
                  Age {display(character.age, "-")}
                </span>
                {assignedPlayerLabel ? (
                  <span className="border border-zinc-800 px-1.5 py-0.5">{assignedPlayerLabel}</span>
                ) : null}
              </div>
              {character.archivedAt ? (
                <div className="mt-1.5">
                  <span className="border border-amber-800 px-1.5 py-0.5 text-xs text-amber-300">
                    Archived
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex-1">
              <PortraitBlock character={character} className="min-h-36" imageClassName="max-h-44" />
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

      <div className="grid gap-2 xl:grid-cols-2">
        <MainCombatSection
          title="Attacks"
          header={<MainMetricPill label="Weapon Skill" value={derivedStats.weaponSkill} />}
        >
          {derivedStats.attacks.length === 0 ? (
            <p className="text-sm text-zinc-500">No equipped attack output.</p>
          ) : (
            <div className="space-y-1.5">
              {derivedStats.attacks.map((attack) => (
                <div key={`${attack.slot}-${attack.label}`} className="border border-zinc-800 bg-zinc-950/50 p-1.5">
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-0.5">
                    <div className="text-xs font-semibold">{attack.label}</div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                      {EQUIPMENT_SLOT_LABELS[attack.slot]}
                    </div>
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-zinc-300">
                    {attack.lines.slice(0, compact ? 3 : attack.lines.length).map((line, index) => (
                      <li key={`${attack.label}-${index}`}>{compactLine(line)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </MainCombatSection>

        <MainCombatSection
          title="Guard / Protection"
          header={
            <div className="flex flex-wrap justify-end gap-1">
              <MainMetricPill label="Armor" value={derivedStats.armorSkill} />
              <MainMetricPill
                label="Dodge"
                value={`${derivedStats.dodgeDice}d / ${formatSheetNumber(derivedStats.dodgeValue)}`}
              />
              <MainMetricPill label="Will" value={derivedStats.willpower} />
            </div>
          }
        >
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-zinc-300">
            {derivedStats.defenceStrings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </MainCombatSection>
      </div>
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
    <SheetFrame title="Character Sheet" subtitle="Identity, narrative details, Characteristics, and Traits.">
      <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <PortraitBlock character={character} />
            <SheetPanel title="Identity">
              <div className="grid gap-2 sm:grid-cols-3">
                <StatTile label="Name" value={display(character.name)} />
                <StatTile label="Race" value={display(character.race, "-")} />
                <StatTile label="Age" value={display(character.age, "-")} />
              </div>
            </SheetPanel>
          </div>
          <SheetPanel title="Description / Backstory">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {display(character.description, "No description.")}
            </p>
          </SheetPanel>
          <SheetPanel title="Great Secret">
            <p className="text-sm leading-relaxed text-zinc-300">{renderGreatSecret(builderData.greatSecret)}</p>
          </SheetPanel>
        </div>

        <div className="space-y-3">
          <SheetPanel title="Characteristics">
            {builderData.characteristics.length === 0 ? (
              <p className="text-sm text-zinc-500">No Characteristics authored.</p>
            ) : (
              <div className="space-y-2">
                {builderData.characteristics
                  .slice(0, compact ? 6 : builderData.characteristics.length)
                  .map((characteristic) => (
                    <div key={characteristic.id} className="border border-zinc-800 bg-zinc-950/50 p-2 text-sm text-zinc-300">
                      {renderCharacteristicDescriptor(characteristic)}
                    </div>
                  ))}
              </div>
            )}
          </SheetPanel>

          <SheetPanel title="Character Traits">
            {traitSummary.selected.length === 0 ? (
              <p className="text-sm text-zinc-500">No Traits selected.</p>
            ) : (
              <div className="space-y-2">
                {traitSummary.selected.map((trait) => (
                  <div key={trait.id} className="border border-zinc-800 bg-zinc-950/50 p-2 text-sm text-zinc-300">
                    <div className="font-medium text-zinc-100">
                      {trait.name} ({signedTraitPointDisplay(trait)})
                    </div>
                    <p className="mt-1">{trait.descriptor}</p>
                  </div>
                ))}
              </div>
            )}
          </SheetPanel>

          <SheetPanel title="Bonds">
            <p className="text-sm text-zinc-500">Bonds are not authored in the V1 player builder.</p>
          </SheetPanel>

          {builderData.narrativeNotes?.trim() ? (
            <SheetPanel title="Narrative Notes">
              <p className="whitespace-pre-wrap text-sm text-zinc-300">
                {builderData.narrativeNotes}
              </p>
            </SheetPanel>
          ) : null}
        </div>
      </div>
    </SheetFrame>
  );
}

function PowerReferenceSheet({ powerBudget }: { powerBudget: CharacterPowerBudget }) {
  return (
    <SheetFrame title="Power Sheet(s)" subtitle="Power references generated from the shared descriptor and resolver output.">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Power Pool" value={formatSheetNumber(powerBudget.powerPool)} emphasis />
        <StatTile label="Spend Scalar" value={`x${formatSheetNumber(powerBudget.playerPowerSpendScalar)}`} />
        <StatTile label="Spent" value={formatSheetNumber(powerBudget.totalSpent)} />
        <StatTile
          label="Remaining"
          value={formatSheetNumber(powerBudget.remaining)}
          helper={powerBudget.overspent ? "Overspent" : undefined}
        />
      </div>

      {powerBudget.powers.length === 0 ? (
        <SheetPanel title="Powers">
          <p className="text-sm text-zinc-500">No powers authored.</p>
        </SheetPanel>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {powerBudget.powers.map((summary, index) => (
            <section key={`${summary.power.name}-${index}`} className="cb-power-card border-2 border-zinc-800 bg-black/60 p-2.5">
              <div className="border-b border-zinc-800 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold uppercase tracking-[0.04em]">
                      {summary.power.name || `Power ${index + 1}`}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                      <span className="border border-zinc-800 px-1.5 py-0.5">
                        {titleCase(summary.power.descriptorChassis)}
                      </span>
                      <span className="border border-zinc-800 px-1.5 py-0.5">
                        Counter {titleCase(summary.power.counterMode)}
                      </span>
                    </div>
                  </div>
                  <div className={summary.costValid ? "text-center text-xs text-zinc-300" : "text-xs font-medium text-red-300"}>
                    {summary.costValid ? (
                      <span className="block border border-zinc-800 px-1.5 py-1">
                        <span className="block text-[9px] uppercase tracking-[0.08em] text-zinc-500">Cooldown</span>
                        {summary.derivedCooldownTurns ?? 1}
                      </span>
                    ) : (
                      `Invalid: ${summary.invalidCostReason ?? "Power is invalid."}`
                    )}
                  </div>
                </div>
                {summary.power.description?.trim() ? (
                  <p className="mt-2 text-xs italic text-zinc-400">{summary.power.description}</p>
                ) : null}
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
  return (
    <SheetFrame title="Inventory Sheet" subtitle="Equipped gear and Backpack items.">
      <SheetPanel title="Protection Summary">
        <div className="grid gap-2 sm:grid-cols-2">
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
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {equipped.map(({ slot, backpackItem }) => (
              <EquippedItemCompactCard key={slot} slot={slot} item={backpackItem} />
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

  return (
    <div
      className={[
        "cb-sheet-preview space-y-5",
        compact ? "cb-sheet-compact" : "cb-sheet-full",
        printFriendly ? "cb-sheet-print-friendly" : "cb-sheet-colour",
        mode === "print" ? "cb-sheet-print-mode" : "cb-sheet-live-mode",
        className,
      ].join(" ")}
    >
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

      <style jsx global>{`
        .cb-sheet-preview {
          color: #111111;
        }

        .cb-sheet-preview .cb-sheet-page {
          border-color: #3f3f46;
          background: #ffffff;
          color: #111111;
        }

        .cb-sheet-preview .cb-sheet-title-band,
        .cb-sheet-preview .cb-identity-band,
        .cb-sheet-preview .cb-power-card,
        .cb-sheet-preview .cb-stat-tile,
        .cb-sheet-preview .cb-attribute-card,
        .cb-sheet-preview .cb-main-reference-tile,
        .cb-sheet-preview .cb-main-combat-section,
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
    </div>
  );
}
