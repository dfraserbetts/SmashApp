'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CampaignNav } from '@/app/components/CampaignNav';
import { supabaseClient } from '@/lib/supabaseClient';

type InventoryItem = {
  id: string;
  name: string | null;
  rarity: string | null;
  level: number | null;
  size: string | null;
  armorLocation: string | null;
  itemLocation: string | null;
};

function formatDetails(item: InventoryItem) {
  const rarity = item.rarity ?? '-';
  const level = item.level ?? '-';
  const location = item.size ?? item.armorLocation ?? item.itemLocation ?? '-';
  return `${rarity} - ${level} - ${location}`;
}

export default function CampaignInventoryPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const campaignId =
    typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const canDelete = role === 'GAME_DIRECTOR';

  const selectedCount = selectedIds.size;

  const selectedArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  async function loadItems() {
    if (!campaignId) {
      setError('Missing campaign id.');
      setItems([]);
      setSelectedIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/forge/items?campaignId=${encodeURIComponent(campaignId)}`,
      );

      if (res.status === 401) {
        setError('Unauthorized.');
        setLoading(false);
        return;
      }

      if (res.status === 403) {
        setError('Forbidden.');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Failed to load items (${res.status})`);
      }

      const json = (await res.json()) as any[];
      const mapped: InventoryItem[] = Array.isArray(json)
        ? json.map((row) => ({
            id: String(row?.id ?? ''),
            name: row?.name ?? null,
            rarity: row?.rarity ?? null,
            level:
              typeof row?.level === 'number' ? row.level : row?.level ?? null,
            size: row?.size ?? null,
            armorLocation: row?.armorLocation ?? null,
            itemLocation: row?.itemLocation ?? null,
          }))
        : [];

      setItems(mapped);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load items.');
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      if (!campaignId) return;

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session?.user?.id) {
          if (!cancelled) setRole(null);
          return;
        }

        const { data, error: memberError } = await supabaseClient
          .from('CampaignUser')
          .select('role')
          .eq('campaignId', campaignId)
          .eq('userId', session.user.id)
          .maybeSingle();

        if (memberError) throw memberError;

        if (!cancelled) setRole(data?.role ?? null);
      } catch {
        if (!cancelled) setRole(null);
      }
    }

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function toggleSelection(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (!campaignId) {
      setActionError('Missing campaign id.');
      return;
    }
    if (!canDelete || selectedIds.size === 0 || deleting) return;

    const confirmed = window.confirm(
      'This is an irreversible action and cannot be undone. Delete selected item(s)?',
    );

    if (!confirmed) return;

    setDeleting(true);
    setActionError(null);

    try {
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/item-templates`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ itemIds: selectedArray }),
        },
      );

      if (!res.ok) {
        let message = 'Failed to delete items.';
        try {
          const payload = await res.json();
          if (payload?.error) message = payload.error;
        } catch {}
        throw new Error(message);
      }

      setSelectedIds(new Set());
      await loadItems();
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to delete items.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-screen w-full bg-black text-zinc-100">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <CampaignNav campaignId={campaignId} />

        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Inventory</h1>
            <p className="text-sm text-zinc-400">
              Forged templates for this campaign.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={!canDelete || selectedCount === 0 || deleting}
            className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete selected'}
          </button>
        </header>

        {!canDelete && (
          <p className="text-sm text-zinc-500">
            Read-only view. Only game directors can delete items.
          </p>
        )}

        {loading && (
          <p className="text-sm text-zinc-500">Loading item templates...</p>
        )}

        {error && (
          <p className="text-sm text-red-400">Failed to load items: {error}</p>
        )}

        {actionError && (
          <p className="text-sm text-red-400">{actionError}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-zinc-500">No items found.</p>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-900/60 border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-300">
                    Item Name
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-zinc-300">
                    Details
                  </th>
                  <th className="px-4 py-2 text-center font-medium text-zinc-300">
                    Select
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-800/80 last:border-b-0 hover:bg-zinc-900/60"
                  >
                    <td className="px-4 py-2 align-middle">
                      <div className="flex flex-col">
                        <span className="font-medium text-zinc-100">
                          {item.name ?? '(Unnamed)'}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {item.id}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 align-middle text-zinc-200">
                      {formatDetails(item)}
                    </td>
                    <td className="px-4 py-2 align-middle text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        disabled={!canDelete || deleting}
                        className="h-4 w-4 rounded border-zinc-700 bg-black"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={() => router.replace(`/campaign/${campaignId}`)}
            className="px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-950"
          >
            Back to campaign
          </button>
        </div>
      </div>
    </main>
  );
}
