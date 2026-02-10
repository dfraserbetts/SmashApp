'use client';

import { useCallback, useEffect, useState } from 'react';

export type ForgeItemSummary = {
  id: string;
  name: string | null;
  type: string | null;
  rarity: string | null;
  level: number | null;
  tags: string[];
};

type ForgeItemsState = {
  data: ForgeItemSummary[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

function toSummary(row: any): ForgeItemSummary {
  const rawTags = Array.isArray(row?.tags) ? row.tags : [];
  const tags = rawTags
    .map((entry: unknown) =>
      typeof entry === 'string'
        ? entry
        : typeof (entry as { tag?: unknown })?.tag === 'string'
          ? String((entry as { tag: string }).tag)
          : '',
    )
    .map((entry: string) => entry.trim())
    .filter((entry: string) => entry.length > 0);

  return {
    id: String(row?.id ?? ''),
    name: row?.name ?? null,
    type: row?.type ?? null,
    rarity: row?.rarity ?? null,
    level: typeof row?.level === 'number' ? row.level : row?.level ?? null,
    tags,
  };
}

export function useForgeItems(campaignId: string): ForgeItemsState {
  const [data, setData] = useState<ForgeItemSummary[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!campaignId) {
      setData(null);
      setLoading(false);
      setError('campaignId is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/forge/items?campaignId=${encodeURIComponent(campaignId)}`,
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Items request failed: ${res.status}`);
      }

      const json = (await res.json()) as any[];
      const summaries = Array.isArray(json) ? json.map(toSummary) : [];

      setData(summaries);
      setLoading(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown error fetching items';
      setData(null);
      setLoading(false);
      setError(message);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    loading,
    error,
    refetch: load,
  };
}
