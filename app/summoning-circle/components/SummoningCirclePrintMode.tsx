"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { MonsterSummary, MonsterUpsertInput } from "@/lib/summoning/types";
import { normalizeMonsterUpsertInput } from "@/lib/summoning/validation";
import { MonsterBlockCard, type WeaponProjection } from "@/app/summoning-circle/components/MonsterBlockCard";
import { useScaledPreview } from "@/app/summoning-circle/components/useScaledPreview";
import { useProtectionTuning } from "@/app/summoning-circle/components/useProtectionTuning";

type Props = {
  campaignId: string;
};

type PrintLayoutMode = "COMPACT_1P" | "LEGENDARY_2P";

const LAST_PRINT_PAGE_STYLE: CSSProperties = {
  breakAfter: "auto",
  pageBreakAfter: "auto",
};

const PAGE_BREAK_STYLE: CSSProperties = {
  breakAfter: "page",
  pageBreakAfter: "always",
};

export function SummoningCirclePrintMode({ campaignId }: Props) {
  const [monsters, setMonsters] = useState<MonsterSummary[]>([]);
  const [weapons, setWeapons] = useState<WeaponProjection[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailsById, setDetailsById] = useState<Record<string, MonsterUpsertInput>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetailIds, setLoadingDetailIds] = useState<Record<string, boolean>>({});
  const [printLayout, setPrintLayout] = useState<PrintLayoutMode>("COMPACT_1P");
  const [isPrinting, setIsPrinting] = useState(false);
  const printOnlyRef = useRef<HTMLDivElement | null>(null);
  const protectionTuning = useProtectionTuning();

  const loadedIdsRef = useRef<Set<string>>(new Set());
  const inFlightIdsRef = useRef<Set<string>>(new Set());

  const loadDetail = useCallback(
    async (monsterId: string) => {
      if (loadedIdsRef.current.has(monsterId) || inFlightIdsRef.current.has(monsterId)) return;

      inFlightIdsRef.current.add(monsterId);
      setLoadingDetailIds((prev) => ({ ...prev, [monsterId]: true }));

      try {
        const res = await fetch(
          `/api/summoning-circle/monsters/${monsterId}?campaignId=${encodeURIComponent(campaignId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Failed to load monster");
        }

        const raw = (await res.json()) as Record<string, unknown>;
        const normalizedInput = {
          ...raw,
          tags: Array.isArray(raw.tags)
            ? raw.tags.map((entry) => String((entry as { tag?: unknown }).tag ?? ""))
            : [],
        };
        const parsed = normalizeMonsterUpsertInput(normalizedInput);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }

        loadedIdsRef.current.add(monsterId);
        setDetailsById((prev) => ({ ...prev, [monsterId]: parsed.data }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load monster";
        setError(message);
      } finally {
        inFlightIdsRef.current.delete(monsterId);
        setLoadingDetailIds((prev) => {
          const next = { ...prev };
          delete next[monsterId];
          return next;
        });
      }
    },
    [campaignId],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [monsterRes, weaponRes] = await Promise.all([
          fetch(`/api/summoning-circle/monsters?campaignId=${encodeURIComponent(campaignId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/summoning-circle/weapons?campaignId=${encodeURIComponent(campaignId)}`, {
            cache: "no-store",
          }),
        ]);

        if (!monsterRes.ok) {
          const data = await monsterRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Failed to load monsters");
        }
        if (!weaponRes.ok) {
          const data = await weaponRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Failed to load weapons");
        }

        const monsterData = (await monsterRes.json()) as { monsters?: MonsterSummary[] };
        const weaponData = (await weaponRes.json()) as { weapons?: WeaponProjection[] };

        if (cancelled) return;
        setMonsters(
          (monsterData.monsters ?? []).filter((m) => m.source === "CAMPAIGN" && !m.isReadOnly),
        );
        setWeapons(weaponData.weapons ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load print mode data";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const weaponById = useMemo(() => {
    const map: Record<string, WeaponProjection> = {};
    for (const weapon of weapons) {
      map[weapon.id] = weapon;
    }
    return map;
  }, [weapons]);

  const selectedMonsters = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return monsters
      .filter((monster) => selectedSet.has(monster.id))
      .map((monster) => detailsById[monster.id])
      .filter((monster): monster is MonsterUpsertInput => !!monster);
  }, [detailsById, monsters, selectedIds]);
  const compactOverflowWarnings = useMemo(() => {
    if (printLayout !== "COMPACT_1P") return [];
    return selectedMonsters
      .map((m) => {
        const traitCount = Array.isArray(m.traits) ? m.traits.length : 0;
        const powerCount = Array.isArray(m.powers) ? m.powers.length : 0;
        const hasMythicItemLb =
          Boolean(m.legendary) &&
          Boolean(m.mainHandItemId || m.offHandItemId || m.smallItemId);
        const likelyOverflow =
          powerCount > 6 ||
          traitCount > 6 ||
          Boolean(m.limitBreakName?.trim()) ||
          hasMythicItemLb;
        return likelyOverflow ? `${m.name || "Unnamed Monster"} may overflow in 1-page layout.` : null;
      })
      .filter((x): x is string => Boolean(x));
  }, [printLayout, selectedMonsters]);
  const {
    wrapRef: previewWrapRef,
    innerRef: previewInnerRef,
    scale: previewScale,
    scaledHeight: previewHeight,
  } = useScaledPreview({
    enabled: !isPrinting && selectedMonsters.length > 0,
    contentKey: `${selectedMonsters.length}-${printLayout}`,
  });

  // SC_PRINT_FREEZE_PREVIEW: keep the on-screen preview stable while the print dialog is open
  const frozenPreviewScaleRef = useRef(1);
  const frozenPreviewHeightRef = useRef<number | undefined>(undefined);

  if (!isPrinting) {
    frozenPreviewScaleRef.current = previewScale;
    frozenPreviewHeightRef.current = previewHeight ? Number(previewHeight) : undefined;
  }

  const displayPreviewScale = isPrinting ? frozenPreviewScaleRef.current : previewScale;
  const displayPreviewHeight = isPrinting ? frozenPreviewHeightRef.current : previewHeight;


  useEffect(() => {
    const handleBeforePrint = () => {
      setIsPrinting(true);
    };
    const handleAfterPrint = () => {
      setIsPrinting(false);
    };
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  const onToggle = useCallback(
    (monsterId: string, checked: boolean) => {
      setSelectedIds((prev) => {
        if (checked) {
          if (prev.includes(monsterId)) return prev;
          return [...prev, monsterId];
        }
        return prev.filter((id) => id !== monsterId);
      });

      if (checked) {
        void loadDetail(monsterId);
      }
    },
    [loadDetail],
  );

  const triggerPrint = useCallback(() => {
    window.setTimeout(() => {
      const node = printOnlyRef.current;
      if (node) void node.getBoundingClientRect();
      window.print();
    }, 0);
  }, []);

  const printablePages = useMemo(
    () =>
      selectedMonsters.map((monster, idx) => {
        if (printLayout === "COMPACT_1P") {
          return (
            <article
              key={`${monster.name ?? "monster"}-${idx}`}
              className="sc-print-page mx-auto rounded border border-zinc-700 bg-white shadow-xl"
              style={idx === selectedMonsters.length - 1 ? LAST_PRINT_PAGE_STYLE : PAGE_BREAK_STYLE}
            >
              <div className="sc-print-card-wrap">
                <MonsterBlockCard
                  monster={monster}
                  weaponById={weaponById}
                  isPrint
                  printLayout={printLayout}
                  printPage="COMPACT"
                  protectionTuning={protectionTuning}
                />
              </div>
            </article>
          );
        }

        return (
          <div key={`${monster.name ?? "monster"}-${idx}`} className="space-y-6">
            <article className="sc-print-page mx-auto rounded border border-zinc-700 bg-white shadow-xl">
              <div className="sc-print-card-wrap">
                <MonsterBlockCard
                  monster={monster}
                  weaponById={weaponById}
                  isPrint
                  printLayout={printLayout}
                  printPage="PAGE1_MAIN"
                  protectionTuning={protectionTuning}
                />
              </div>
            </article>

            <article className="sc-print-page mx-auto rounded border border-zinc-700 bg-white shadow-xl">
              <div className="sc-print-card-wrap">
                <MonsterBlockCard
                  monster={monster}
                  weaponById={weaponById}
                  isPrint
                  printLayout={printLayout}
                  printPage="PAGE2_POWER"
                  protectionTuning={protectionTuning}
                />
              </div>
            </article>
          </div>
        );
      }),
    [printLayout, protectionTuning, selectedMonsters, weaponById],
  );

  return (
    <div className="sc-print-root space-y-6">
      <div className="sc-screen-only">
        <section className="sc-print-controls rounded border border-zinc-800 bg-zinc-900/30 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Print Mode</h2>
              <p className="text-sm text-zinc-400">Select monsters and print one monster per A4 page.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400">Layout</span>
                <select
                  value={printLayout}
                  onChange={(e) => setPrintLayout(e.target.value as PrintLayoutMode)}
                  className="rounded border border-zinc-700 bg-zinc-950/40 px-2 py-2 text-sm"
                >
                  <option value="COMPACT_1P">1 Page - Compact</option>
                  <option value="LEGENDARY_2P">2 Page - Legendary Layout</option>
                </select>
              </label>
              <Link
                href={`/campaign/${campaignId}/summoning-circle`}
                className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
              >
                Back To Editor
              </Link>
              <button
                type="button"
                onClick={triggerPrint}
                disabled={selectedIds.length === 0 || selectedMonsters.length !== selectedIds.length}
                className="rounded border border-zinc-700 bg-zinc-100 px-3 py-2 text-sm text-zinc-900 disabled:opacity-50"
              >
                Print
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}
          {compactOverflowWarnings.length > 0 && (
            <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">
              <p className="font-medium">Heads up</p>
              <p className="text-amber-200/90">
                One or more selected monsters may overflow in{" "}
                <span className="font-semibold">1 Page - Compact</span>. Consider switching to{" "}
                <span className="font-semibold">2 Page - Legendary Layout</span>.
              </p>
            </div>
          )}

          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Campaign Monsters</p>
            {loading && <p className="text-sm text-zinc-400">Loading monsters...</p>}
            {!loading && monsters.length === 0 && (
              <p className="text-sm text-zinc-400">No campaign monsters available.</p>
            )}
            {!loading && monsters.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {monsters.map((monster) => {
                  const checked = selectedIds.includes(monster.id);
                  const detailLoading = !!loadingDetailIds[monster.id];
                  return (
                    <label key={monster.id} className="flex items-start gap-2 rounded border border-zinc-800 p-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => onToggle(monster.id, e.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-sm">
                        <span className="block font-medium">{monster.name}</span>
                        <span className="text-zinc-400">
                          Level {monster.level} {monster.tier}
                        </span>
                        {checked && detailLoading && (
                          <span className="block text-xs text-zinc-500">Loading block...</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6 sc-print min-w-0">
          {selectedIds.length === 0 && (
            <div className="sc-print-controls rounded border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
              Select at least one monster to preview printable pages.
            </div>
          )}

          <div className="sc-preview-live flex justify-center w-full">
            <div
              ref={previewWrapRef}
              className="sc-screen-preview sc-print-preview-wrap inline-block"
              style={{
                width: "fit-content",
                overflowX: "hidden",
                maxWidth: "100%",
                height: displayPreviewHeight ? `${displayPreviewHeight}px` : undefined,
              }}
            >
              <div
                ref={previewInnerRef}
                className="sc-print-preview"
                style={{
                  display: "inline-block",
                  width: "max-content",
                  maxWidth: "100%",
                  transformOrigin: "top left",
                  transform: `scale(${displayPreviewScale})`,
                }}
              >
                {printablePages}
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="sc-print-only">
        <div ref={printOnlyRef} className="sc-print-preview">
          {printablePages}
        </div>
      </div>

      <style jsx global>{`
        @media screen {
          /* A4 canvas for on-screen print preview */
          .sc-print-preview .sc-print-page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            box-sizing: border-box;
            background: white;
          }
          .sc-print-preview {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 12px;
          }
          .sc-print-preview .sc-print-page {
            transform-origin: top center;
          }
          .sc-print-preview-wrap {
            background: #0b0b0c;
            padding-bottom: 12px;
          }
          .sc-preview-live {
            width: 100%;
            display: flex;
            justify-content: center;
          }
          .sc-print-page {
            width: 210mm;
            min-height: 297mm;
            padding: 10mm;
          }
        }

        .sc-print-only {
          position: fixed;
          left: -99999px;
          top: 0;
          width: 1px;
          height: 1px;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
        }

        .sc-monster-block {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        @page {
          size: auto;
          margin: 0mm;
        }

        @media print {
          /* Hide the on-screen preview behind the print dialog (prevents “stretching” reflow showing through) */
          .sc-screen-preview {
            visibility: hidden !important;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
          }

          .sc-screen-only {
            display: none !important;
          }

          .sc-print-only {
            display: block !important;
            position: static !important;
            left: auto !important;
            top: auto !important;
            width: auto !important;
            height: auto !important;
            opacity: 1 !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
          }

          .sc-print-controls {
            display: none !important;
          }

          .sc-print-root {
            padding: 0 !important;
            margin: 0 !important;
          }
          .sc-print,
          .sc-print-preview {
            padding: 0 !important;
            margin: 0 !important;
          }
          .sc-print-root > :not([hidden]) ~ :not([hidden]),
          .sc-print > :not([hidden]) ~ :not([hidden]),
          .sc-print-preview > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0 !important;
          }

          .sc-print-preview {
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            transform: none !important;
            width: auto !important;
          }
          .sc-print-only .sc-print-preview {
            width: 100% !important;
            transform: none !important;
          }
          .sc-print-preview-wrap {
            height: auto !important;
            overflow: visible !important;
            background: transparent !important;
            padding-bottom: 0 !important;
          }

          .sc-print-page {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            overflow: visible !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .sc-is-print {
            margin: 0 !important;
          }

          .sc-print-page .sc-monster-card {
            width: 100% !important;
            height: auto !important;
            max-width: none !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }
          .sc-print-preview > .sc-print-page:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .sc-print-card-wrap {
            break-inside: avoid;
            page-break-inside: avoid;
            margin: 0 !important;
            padding: 0 !important;
          }

          .sc-is-print.sc-monster-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .sc-is-print.sc-print-layout-COMPACT_1P {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .sc-is-print.sc-print-layout-LEGENDARY_2P.sc-print-page-PAGE1_MAIN {
            break-after: page !important;
            page-break-after: always !important;
          }
          .sc-is-print.sc-print-layout-LEGENDARY_2P.sc-print-page-PAGE2_POWER {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .sc-monster-block {
            background: #ffffff !important;
            color: #111111 !important;
            border-color: #222222 !important;
          }

          .sc-monster-block * {
            color: inherit !important;
          }
        }
      `}</style>
    </div>
  );
}
