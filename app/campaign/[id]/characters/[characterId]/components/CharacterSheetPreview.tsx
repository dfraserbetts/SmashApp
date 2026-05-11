import type React from "react";

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

function itemBriefMeta(item: CharacterBuilderDerivedBackpackItem) {
  return [
    item.itemTemplate.type,
    item.itemTemplate.rarity,
    item.itemTemplate.level ? `Level ${item.itemTemplate.level}` : null,
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

function itemProtectionSummary(item: CharacterBuilderDerivedBackpackItem) {
  const ppv = item.itemTemplate.ppv ?? 0;
  const mpv = item.itemTemplate.mpv ?? 0;
  if (!ppv && !mpv) return null;
  return `PPV ${ppv || "-"} / MPV ${mpv || "-"}`;
}

function itemModifierSummary(item: CharacterBuilderDerivedBackpackItem) {
  const modifiers = item.itemTemplate.globalAttributeModifiers ?? [];
  return modifiers
    .filter((modifier) => modifier.attribute && typeof modifier.amount === "number" && modifier.amount !== 0)
    .slice(0, 4)
    .map((modifier) => `${modifier.attribute} ${signed(Number(modifier.amount))}`)
    .join(", ");
}

function itemDescriptorPreview(item: CharacterBuilderDerivedBackpackItem, maxLines = 2) {
  const sections = item.itemTemplate.descriptorSections ?? [];
  const sectionLines = sections.flatMap((section) => section.lines.map((line) => compactLine(line)));
  const lines = sectionLines.length > 0 ? sectionLines : item.itemTemplate.details ? [item.itemTemplate.details] : [];
  return lines.filter(Boolean).slice(0, maxLines);
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
      className={[
        "cb-sheet-page overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm",
        className,
      ].join(" ")}
    >
      <header className="cb-sheet-title-band border-b border-zinc-800 bg-zinc-900/70 px-4 py-3">
        <h2 className="text-lg font-semibold uppercase tracking-[0.08em]">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-zinc-400">{subtitle}</p> : null}
      </header>
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

function PortraitBlock({ character }: { character: CharacterSheetCharacter }) {
  return (
    <div className="cb-portrait flex min-h-44 items-center justify-center border border-zinc-800 bg-black">
      {isHttpUrl(character.imageUrl) ? (
        <img
          src={character.imageUrl ?? ""}
          alt={display(character.name)}
          className="max-h-56 w-full object-contain"
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
    <div className={`cb-attribute-card border px-2 py-1.5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-1">
        <div className="text-xs font-semibold leading-tight text-zinc-100">{attribute}</div>
        <div className="text-right text-2xl font-semibold leading-none text-zinc-100">
          {baseNumber ? effective : "-"}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1 text-center text-[10px] leading-tight text-zinc-400">
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
  title,
  tone,
  stats,
  attributes,
  builderData,
  derivedStats,
}: {
  title: string;
  tone: "mental" | "physical";
  stats: Array<{ label: string; value: React.ReactNode; helper?: React.ReactNode }>;
  attributes: CharacterAttribute[];
  builderData: CharacterBuilderData;
  derivedStats: CharacterDerivedCombatStats;
}) {
  const titleClass = tone === "mental" ? "text-cyan-200" : "text-emerald-200";

  return (
    <div className="cb-combat-side space-y-2">
      <p className={`border-b border-zinc-800 pb-1 text-xs font-semibold uppercase tracking-[0.1em] ${titleClass}`}>
        {title}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {stats.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} helper={stat.helper} />
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

function MainCombatSheet({
  character,
  builderData,
  derivedStats,
  equipped,
  compact,
  campaignName,
  assignedPlayerLabel,
}: {
  character: CharacterSheetCharacter;
  builderData: CharacterBuilderData;
  derivedStats: CharacterDerivedCombatStats;
  equipped: EquippedEntry[];
  compact: boolean;
  campaignName?: string | null;
  assignedPlayerLabel?: string | null;
}) {
  return (
    <SheetFrame
      title="Main Combat"
      subtitle="Combat table reference generated from live Character Builder data."
    >
      <div className="cb-main-hero border-2 border-zinc-800 bg-black/40 p-2.5">
        <div className="grid grid-cols-1 items-stretch gap-2.5 lg:grid-cols-[1.15fr_1.35fr_1.15fr]">
          <CombatSide
            title="Mental Reference"
            tone="mental"
            stats={[
              { label: "Mental Health", value: derivedStats.mentalHealth },
              {
                label: "MPV",
                value: derivedStats.mentalProtection,
                helper: `${derivedStats.mentalBlockPerSuccess} block / success`,
              },
              { label: "Willpower", value: derivedStats.willpower },
            ]}
            attributes={["Intellect", "Synergy", "Bravery"]}
            builderData={builderData}
            derivedStats={derivedStats}
          />

          <div className="cb-identity-center flex flex-col gap-2 text-center">
            <div className="cb-identity-band border border-zinc-800 bg-zinc-950/70 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                {campaignName || "Character"}
              </div>
              <h1 className="mt-1 text-2xl font-semibold uppercase leading-tight tracking-[0.04em]">
                {display(character.name)}
              </h1>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-zinc-300">
                <span className="border border-zinc-800 px-2 py-1">Level {character.level}</span>
                <span className="border border-zinc-800 px-2 py-1">
                  {display(character.race, "Race unset")}
                </span>
                <span className="border border-zinc-800 px-2 py-1">
                  Age {display(character.age, "-")}
                </span>
                {assignedPlayerLabel ? (
                  <span className="border border-zinc-800 px-2 py-1">{assignedPlayerLabel}</span>
                ) : null}
              </div>
              {character.archivedAt ? (
                <div className="mt-2">
                  <span className="border border-amber-800 px-2 py-1 text-xs text-amber-300">
                    Archived
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex-1">
              <PortraitBlock character={character} />
            </div>
          </div>

          <CombatSide
            title="Physical Reference"
            tone="physical"
            stats={[
              { label: "Physical Health", value: derivedStats.physicalHealth },
              {
                label: "PPV",
                value: derivedStats.physicalProtection,
                helper: `${derivedStats.physicalBlockPerSuccess} block / success`,
              },
              { label: "Weapon Skill", value: derivedStats.weaponSkill },
              { label: "Armor Skill", value: derivedStats.armorSkill },
              {
                label: "Dodge",
                value: `${derivedStats.dodgeDice} dice`,
                helper: `Value ${formatSheetNumber(derivedStats.dodgeValue)}`,
              },
            ]}
            attributes={["Attack", "Guard", "Fortitude"]}
            builderData={builderData}
            derivedStats={derivedStats}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SheetPanel title="Attacks">
          {derivedStats.attacks.length === 0 ? (
            <p className="text-sm text-zinc-500">No equipped attack output.</p>
          ) : (
            <div className="space-y-2">
              {derivedStats.attacks.map((attack) => (
                <div key={`${attack.slot}-${attack.label}`} className="border border-zinc-800 bg-zinc-950/50 p-2">
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-1">
                    <div className="text-sm font-semibold">{attack.label}</div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                      {EQUIPMENT_SLOT_LABELS[attack.slot]}
                    </div>
                  </div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-zinc-300">
                    {attack.lines.slice(0, compact ? 3 : attack.lines.length).map((line, index) => (
                      <li key={`${attack.label}-${index}`}>{compactLine(line)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </SheetPanel>

        <SheetPanel title="Guard / Protection">
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {derivedStats.defenceStrings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {derivedStats.protectionSources.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {derivedStats.protectionSources.map((source) => (
                <div key={`${source.slot}-${source.itemName}`} className="border border-zinc-800 p-2 text-xs">
                  <span className="font-medium">{EQUIPMENT_SLOT_LABELS[source.slot]}:</span>{" "}
                  {source.itemName} / PPV {source.physicalProtection} / MPV {source.mentalProtection}
                </div>
              ))}
            </div>
          ) : null}
        </SheetPanel>
      </div>

      <SheetPanel title="Equipped Gear">
        {equipped.length === 0 ? (
          <p className="text-sm text-zinc-500">No gear equipped.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {equipped.map(({ slot, backpackItem }) => (
              <div key={slot} className="border border-zinc-800 bg-zinc-950/50 p-2 text-sm">
                <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                  {EQUIPMENT_SLOT_LABELS[slot]}
                </div>
                <div className="font-medium">{itemName(backpackItem)}</div>
                <div className="text-xs text-zinc-500">{itemMeta(backpackItem)}</div>
                {[itemProtectionSummary(backpackItem), itemModifierSummary(backpackItem)]
                  .filter(Boolean)
                  .map((line) => (
                    <div key={line} className="mt-1 text-xs text-zinc-300">
                      {line}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </SheetPanel>
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
                  <div className={summary.costValid ? "grid grid-cols-3 gap-1 text-center text-xs text-zinc-300" : "text-xs font-medium text-red-300"}>
                    {summary.costValid ? (
                      <>
                        <span className="border border-zinc-800 px-1.5 py-1">
                          <span className="block text-[9px] uppercase tracking-[0.08em] text-zinc-500">Spend</span>
                          {formatSheetNumber(summary.spend)}
                        </span>
                        <span className="border border-zinc-800 px-1.5 py-1">
                          <span className="block text-[9px] uppercase tracking-[0.08em] text-zinc-500">Base</span>
                          {formatSheetNumber(summary.basePowerValue)}
                        </span>
                        <span className="border border-zinc-800 px-1.5 py-1">
                          <span className="block text-[9px] uppercase tracking-[0.08em] text-zinc-500">Cooldown</span>
                          {summary.derivedCooldownTurns ?? 1}
                        </span>
                      </>
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
  compact,
}: {
  backpackItems: CharacterBuilderDerivedBackpackItem[];
  equipped: EquippedEntry[];
  compact: boolean;
}) {
  return (
    <SheetFrame title="Inventory Sheet" subtitle="Equipped gear and Backpack items.">
      <SheetPanel title="Equipped Gear">
        {equipped.length === 0 ? (
          <p className="text-sm text-zinc-500">No gear equipped.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {equipped.map(({ slot, backpackItem }) => (
              <div key={slot} className="border border-zinc-800 bg-zinc-950/50 p-2 text-sm">
                <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-1">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                    {EQUIPMENT_SLOT_LABELS[slot]}
                  </div>
                  <div className="text-[10px] text-zinc-500">{itemBriefMeta(backpackItem)}</div>
                </div>
                <div className="mt-1 font-medium">{itemName(backpackItem)}</div>
                <div className="text-xs text-zinc-500">{itemMeta(backpackItem)}</div>
                {[itemProtectionSummary(backpackItem), itemModifierSummary(backpackItem)]
                  .filter(Boolean)
                  .map((line) => (
                    <div key={line} className="mt-1 text-xs text-zinc-300">
                      {line}
                    </div>
                  ))}
                {itemDescriptorPreview(backpackItem, 2).length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
                    {itemDescriptorPreview(backpackItem, 2).map((line, index) => (
                      <li key={`${slot}-${index}`}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
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
          equipped={equipped}
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
        <InventorySheet backpackItems={backpackItems} equipped={equipped} compact={compact} />
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
