'use client';

import Link from 'next/link';
import { useForgeItems } from '../../../lib/forge/useForgeItems';

export default function ForgeLibraryPage() {
  const { data, loading, error } = useForgeItems();

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Forge Library</h1>
          <p className="text-sm text-zinc-400">
            All forged templates in one place. No more rummaging in the Bag of Holding.
          </p>
        </div>
        <Link
          href="/forge/create"
          className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          + Forge New Item
        </Link>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        {loading && (
          <p className="text-sm text-zinc-500">Loading item templates…</p>
        )}

        {error && (
          <p className="text-sm text-red-400">
            Failed to load items: {error}
          </p>
        )}

        {!loading && !error && (!data || data.length === 0) && (
          <p className="text-sm text-zinc-500">
            No items found yet. Time to hit the anvil.
          </p>
        )}

        {data && data.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs text-zinc-500">
              Showing {data.length} template{data.length === 1 ? '' : 's'}.
            </div>

            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-900/60 border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-zinc-300">
                      Name
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-300">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-300">
                      Rarity
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-300">
                      Level
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-zinc-800/80 last:border-b-0 hover:bg-zinc-900/60"
                    >
                      <td className="px-4 py-2 align-middle">
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-100">
                            {item.name}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {item.id}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle text-right">
                        <Link
                          href={`/forge/edit/${encodeURIComponent(item.id)}`}
                          className="inline-flex items-center rounded-md border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
