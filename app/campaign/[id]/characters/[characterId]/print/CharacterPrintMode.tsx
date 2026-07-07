"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CHARACTER_SHEET_LABELS,
  CHARACTER_SHEET_PRINT_TYPE_LABELS,
  CHARACTER_SHEET_THEME_LABELS,
  CharacterSheetPreview,
  DEFAULT_CHARACTER_SHEETS,
  type CharacterSheetKey,
  type CharacterSheetPrintType,
  type CharacterSheetSelection,
  type CharacterSheetTheme,
} from "@/app/campaign/[id]/characters/[characterId]/components/CharacterSheetPreview";
import { useProtectionTuning } from "@/app/summoning-circle/components/useProtectionTuning";
import {
  normalizeBuilderData,
  selectedTraitSummary,
  type CharacterBuilderData,
  type PlayerTraitDefinition,
} from "@/lib/characterBuilder/core";
import {
  buildCharacterDerivedCombatStats,
  type CharacterBuilderDerivedBackpackItem,
} from "@/lib/characterBuilder/derivedStats";
import { signatureMovePointPool, summarizeCharacterPowers } from "@/lib/characterBuilder/powers";
import type { CharacterBuilderTuningSnapshot } from "@/lib/config/characterBuilderTuningShared";
import type { CombatDieSize } from "@/lib/combat-lab/types";
import type { PowerTuningSnapshot } from "@/lib/config/powerTuningShared";

type BuilderCharacter = {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string | null;
  age: string | null;
  race: string | null;
  description: string | null;
  level: number;
  builderData: CharacterBuilderData;
  archivedAt: string | null;
  archiveReason: string | null;
};

type BuilderPayload = {
  campaign: { id: string; name: string };
  character: BuilderCharacter;
  assignedPlayerLabel: string;
  traitCatalog: PlayerTraitDefinition[];
  backpackItems: CharacterBuilderDerivedBackpackItem[];
  powerTuning: PowerTuningSnapshot;
  characterBuilderTuning: CharacterBuilderTuningSnapshot;
  error?: string;
};

function privacySafePlayerLabel(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withoutParentheticalEmail = trimmed.replace(/\s*\([^()\s]+@[^()\s]+\)\s*$/, "").trim();
  if (!withoutParentheticalEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(withoutParentheticalEmail)) {
    return null;
  }
  return withoutParentheticalEmail;
}

function combatDieForAttributeValue(value: number): CombatDieSize {
  if (value >= 12) return "D12";
  if (value >= 10) return "D10";
  if (value >= 8) return "D8";
  if (value >= 6) return "D6";
  return "D4";
}

export function CharacterPrintMode({
  campaignId,
  characterId,
}: {
  campaignId: string;
  characterId: string;
}) {
  const [payload, setPayload] = useState<BuilderPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [printType, setPrintType] = useState<CharacterSheetPrintType>("full-colour");
  const [theme, setTheme] = useState<CharacterSheetTheme>("classic");
  const [sheets, setSheets] = useState<CharacterSheetSelection>(DEFAULT_CHARACTER_SHEETS);
  const protectionTuning = useProtectionTuning();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}/builder`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as BuilderPayload;
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load character print data.");
        }
        if (!cancelled) {
          setPayload({
            ...data,
            character: {
              ...data.character,
              builderData: normalizeBuilderData(data.character.builderData),
            },
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load character print data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId, characterId]);

  const derivedStats = useMemo(() => {
    if (!payload) return null;
    return buildCharacterDerivedCombatStats({
      level: payload.character.level,
      builderData: payload.character.builderData,
      backpackItems: payload.backpackItems,
      protectionTuning,
    });
  }, [payload, protectionTuning]);

  const offencePressureDie = useMemo(() => {
    if (!payload || !derivedStats) return null;
    const attack = Number(payload.character.builderData.attributes.Attack);
    const itemAttackModifier = Math.max(0, derivedStats.itemModifiers.attackModifier ?? 0);
    return combatDieForAttributeValue((Number.isFinite(attack) ? attack : 0) + itemAttackModifier);
  }, [derivedStats, payload]);

  const powerBudget = useMemo(() => {
    if (!payload) return null;
    return summarizeCharacterPowers({
      level: payload.character.level,
      powers: payload.character.builderData.powers,
      tuningSnapshot: payload.powerTuning,
      playerPowerSpendScalar: payload.characterBuilderTuning.playerPowerSpendScalar,
      offencePressureDie,
    });
  }, [offencePressureDie, payload]);

  const signatureMoveBudget = useMemo(() => {
    if (!payload) return null;
    return summarizeCharacterPowers({
      level: payload.character.level,
      powers: payload.character.builderData.signatureMove ? [payload.character.builderData.signatureMove] : [],
      tuningSnapshot: payload.powerTuning,
      playerPowerSpendScalar: payload.characterBuilderTuning.playerPowerSpendScalar,
      powerPool: signatureMovePointPool(payload.character.level),
      powerPoolKind: "signature",
      offencePressureMode: "reviewOnly",
      offencePressureDie,
    });
  }, [offencePressureDie, payload]);

  const traitSummary = useMemo(() => {
    if (!payload) return null;
    return selectedTraitSummary(
      payload.character.builderData.selectedTraitKeys,
      payload.character.level,
      payload.traitCatalog,
    );
  }, [payload]);

  const printFriendly = printType.endsWith("print-friendly");
  const darkPrestigeColourPrint =
    (theme === "dark-prestige" || theme === "dark-prestige-v2") && !printFriendly;

  const triggerPrint = useCallback(() => {
    window.setTimeout(() => window.print(), 0);
  }, []);

  function toggleSheet(sheet: CharacterSheetKey, checked: boolean) {
    setSheets((current) => ({ ...current, [sheet]: checked }));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-zinc-400 md:px-6">
        Loading printable character sheets...
      </div>
    );
  }

  if (error || !payload || !derivedStats || !powerBudget || !traitSummary) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 md:px-6">
        <p className="rounded border border-red-900/60 bg-red-950/30 p-4 text-red-200">
          {error ?? "Character print data is unavailable."}
        </p>
        <Link
          href={`/campaign/${campaignId}/characters`}
          className="inline-block rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
        >
          Back to Character Management
        </Link>
      </div>
    );
  }

  return (
    <div
      className={[
        "cb-print-root mx-auto max-w-6xl space-y-6 px-4 pb-10 md:px-6",
        printFriendly ? "cb-print-friendly" : "cb-print-colour",
        `cb-print-theme-${theme}`,
      ].join(" ")}
    >
      <section className="character-print-controls rounded border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Print Setup</h2>
            <p className="text-sm text-zinc-400">
              Choose a print style and the sheets to include.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/campaign/${campaignId}/characters/${characterId}/builder`}
              className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
            >
              Back to Builder
            </Link>
            <button
              type="button"
              onClick={triggerPrint}
              className="rounded border border-zinc-700 bg-zinc-100 px-3 py-2 text-sm text-zinc-950 hover:bg-white"
            >
              Print
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,360px)_1fr]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="block text-sm">
              <span className="text-zinc-400">Print Type</span>
              <select
                value={printType}
                onChange={(event) => setPrintType(event.target.value as CharacterSheetPrintType)}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                {Object.entries(CHARACTER_SHEET_PRINT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="text-zinc-400">Theme</span>
              <select
                value={theme}
                onChange={(event) => setTheme(event.target.value as CharacterSheetTheme)}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                {Object.entries(CHARACTER_SHEET_THEME_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <div className="text-sm text-zinc-400">Sheets</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              {(Object.keys(CHARACTER_SHEET_LABELS) as CharacterSheetKey[]).map((sheet) => (
                <label key={sheet} className="flex items-center gap-2 rounded border border-zinc-800 p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sheets[sheet]}
                    onChange={(event) => toggleSheet(sheet, event.target.checked)}
                  />
                  {CHARACTER_SHEET_LABELS[sheet]}
                </label>
              ))}
            </div>
          </div>
        </div>
        {darkPrestigeColourPrint ? (
          <p className="mt-3 rounded border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
            Dark Prestige colour printing uses background colours. In Chrome&apos;s print dialog, enable Background graphics for the PDF/printout to match this preview.
          </p>
        ) : null}
      </section>

      <CharacterSheetPreview
        mode="print"
        character={payload.character}
        builderData={payload.character.builderData}
        backpackItems={payload.backpackItems}
        derivedStats={derivedStats}
        powerBudget={powerBudget}
        signatureMoveBudget={signatureMoveBudget}
        traitSummary={traitSummary}
        printType={printType}
        theme={theme}
        sheets={sheets}
        campaignName={payload.campaign.name}
        assignedPlayerLabel={privacySafePlayerLabel(payload.assignedPlayerLabel)}
      />

      <style jsx global>{`
        .cb-print-friendly .cb-sheet-preview,
        .cb-print-friendly .cb-sheet-preview .cb-sheet-page,
        .cb-print-friendly .cb-sheet-preview .cb-sheet-panel,
        .cb-print-friendly .cb-sheet-preview .cb-stat-tile,
        .cb-print-friendly .cb-sheet-preview .cb-power-card {
          color: rgb(24 24 27);
        }
        .cb-print-friendly .cb-sheet-preview .cb-sheet-page,
        .cb-print-friendly .cb-sheet-preview .cb-sheet-panel,
        .cb-print-friendly .cb-sheet-preview .cb-stat-tile,
        .cb-print-friendly .cb-sheet-preview .cb-power-card,
        .cb-print-friendly .cb-sheet-preview .cb-identity-band,
        .cb-print-friendly .cb-sheet-preview .cb-portrait {
          border-color: rgb(212 212 216);
          background: rgb(255 255 255);
        }
        .cb-print-friendly .cb-sheet-preview .cb-sheet-title-band {
          border-color: rgb(212 212 216);
          background: rgb(244 244 245);
        }
        .cb-sheet-compact .cb-sheet-page,
        .cb-sheet-compact .cb-sheet-panel,
        .cb-sheet-compact .cb-stat-tile,
        .cb-sheet-compact .cb-power-card {
          font-size: 0.82rem;
          line-height: 1.2rem;
        }
        .cb-sheet-page,
        .cb-sheet-panel,
        .cb-stat-tile,
        .cb-power-card {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          html,
          body {
            background: white !important;
          }
          .character-print-controls {
            display: none !important;
          }
          .cb-print-root {
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .cb-sheet-preview {
            display: block !important;
            padding: 0 !important;
            background: transparent !important;
          }
          .cb-sheet-page {
            width: 210mm !important;
            min-height: 297mm !important;
            aspect-ratio: 210 / 297 !important;
            break-after: page;
            page-break-after: always;
            margin: 0 !important;
            box-shadow: none !important;
          }
          .cb-sheet-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .cb-print-friendly .cb-sheet-preview .cb-sheet-page,
          .cb-print-friendly .cb-sheet-preview .cb-sheet-page * {
            color: rgb(24 24 27) !important;
            text-shadow: none !important;
            box-shadow: none !important;
            border-color: rgb(161 161 170) !important;
          }
          .cb-print-friendly .cb-sheet-preview .cb-sheet-page,
          .cb-print-friendly .cb-sheet-preview .cb-sheet-title-band,
          .cb-print-friendly .cb-sheet-preview .cb-sheet-panel,
          .cb-print-friendly .cb-sheet-preview .cb-stat-tile,
          .cb-print-friendly .cb-sheet-preview .cb-power-card,
          .cb-print-friendly .cb-sheet-preview .cb-identity-band,
          .cb-print-friendly .cb-sheet-preview .cb-portrait,
          .cb-print-friendly .cb-sheet-preview .cb-main-banner,
          .cb-print-friendly .cb-sheet-preview .cb-main-banner-logo,
          .cb-print-friendly .cb-sheet-preview .cb-main-banner-field,
          .cb-print-friendly .cb-sheet-preview .cb-main-hero,
          .cb-print-friendly .cb-sheet-preview .cb-main-reference-tile,
          .cb-print-friendly .cb-sheet-preview .cb-main-combat-section,
          .cb-print-friendly .cb-sheet-preview .cb-main-traits-section,
          .cb-print-friendly .cb-sheet-preview .cb-main-helper-strip,
          .cb-print-friendly .cb-sheet-preview .cb-main-defence-box,
          .cb-print-friendly .cb-sheet-preview .cb-main-output-row,
          .cb-print-friendly .cb-sheet-preview .cb-inventory-summary,
          .cb-print-friendly .cb-sheet-preview .cb-inventory-loadout,
          .cb-print-friendly .cb-sheet-preview .cb-inventory-slot-card,
          .cb-print-friendly .cb-sheet-preview .cb-inventory-effects-ledger,
          .cb-print-friendly .cb-sheet-preview .cb-inventory-effects-row {
            background: white !important;
          }
          .cb-print-colour .cb-sheet-page,
          .cb-print-colour .cb-sheet-page * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
