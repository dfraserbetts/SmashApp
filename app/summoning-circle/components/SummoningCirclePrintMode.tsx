"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MonsterSummary, MonsterUpsertInput } from "@/lib/summoning/types";
import { normalizeMonsterUpsertInput } from "@/lib/summoning/validation";
import { MonsterBlockCard, type WeaponProjection } from "@/app/summoning-circle/components/MonsterBlockCard";

type Props = {
  campaignId: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function SummoningCirclePrintMode({ campaignId }: Props) {
  const [monsters, setMonsters] = useState<MonsterSummary[]>([]);
  const [weapons, setWeapons] = useState<WeaponProjection[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailsById, setDetailsById] = useState<Record<string, MonsterUpsertInput>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetailIds, setLoadingDetailIds] = useState<Record<string, boolean>>({});

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

  const pages = useMemo(() => chunk(selectedMonsters, 4), [selectedMonsters]);

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
    // Keep print trigger isolated so we can swap this for server-side PDF generation later.
    window.print();
  }, []);

  return (
    <div className="sc-print-root space-y-6">
      <section className="sc-print-controls rounded border border-zinc-800 bg-zinc-900/30 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Print Mode</h2>
            <p className="text-sm text-zinc-400">Select monsters and print a 2x2 A4 block sheet.</p>
          </div>
          <div className="flex items-center gap-2">
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

      <section className="space-y-6">
        {selectedIds.length === 0 && (
          <div className="sc-print-controls rounded border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">
            Select at least one monster to preview printable pages.
          </div>
        )}

        {pages.map((page, pageIndex) => (
          <article key={pageIndex} className="sc-print-page mx-auto rounded border border-zinc-700 bg-white shadow-xl">
            <div className="sc-print-grid grid grid-cols-2 grid-rows-2 gap-3 h-full">
              {Array.from({ length: 4 }).map((_, slotIndex) => {
                const monster = page[slotIndex];
                return (
                  <div key={slotIndex} className="sc-print-card-wrap min-h-0">
                    {monster ? (
                      <MonsterBlockCard
                        monster={monster}
                        weaponById={weaponById}
                        className="h-full"
                      />
                    ) : (
                      <div className="h-full rounded border border-dashed border-zinc-300 bg-zinc-50" />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="sc-print-controls mt-2 text-center text-xs text-zinc-500">A4 Page {pageIndex + 1}</p>
          </article>
        ))}
      </section>

      <style jsx global>{`
        .sc-print-page {
          width: 210mm;
          min-height: 297mm;
          padding: 10mm;
        }

        .sc-monster-block {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          .sc-print-controls {
            display: none !important;
          }

          .sc-print-root {
            padding: 0 !important;
            margin: 0 !important;
          }

          .sc-print-page {
            width: auto !important;
            min-height: auto !important;
            padding: 0 !important;
            margin: 0 auto !important;
            border: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
            break-after: page;
            page-break-after: always;
          }

          .sc-print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }

          .sc-print-grid {
            gap: 5mm !important;
          }

          .sc-print-card-wrap {
            break-inside: avoid;
            page-break-inside: avoid;
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
