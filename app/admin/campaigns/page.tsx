"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// [ANCHOR:ADMIN_CAMPAIGNS_LIST_PAGE]

type CampaignRow = {
  id: string;
  createdAt: string;
  name: string;
  ownerUserId: string;
  descriptorVersionTag: string;
  membersCount: number;
  itemsCount: number;
  monstersCount: number;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminCampaignsPage() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/campaigns", { cache: "no-store" });
      const data = (await res.json()) as { rows?: CampaignRow[]; error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Failed to load campaigns");
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Failed to load campaigns"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      return row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle);
    });
  }, [rows, query]);

  return (
    <div className="space-y-6">
      <Link className="text-sm underline" href="/admin">
        {"<-"} Back to Admin Dashboard
      </Link>

      <div className="rounded-lg border p-4">
        <h2 className="text-lg font-medium">ADMIN: Campaign Inspector</h2>
        <p className="mt-1 text-sm opacity-80">
          Browse every campaign and inspect members, forged items, and monsters.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1">
          <label className="text-sm">Search campaigns</label>
          <input
            className="mt-1 w-full rounded border bg-transparent p-2 text-sm"
            placeholder="Filter by campaign name or id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="rounded border px-4 py-2 text-sm" onClick={load}>
          Refresh
        </button>
      </div>

      {err && <div className="rounded border p-3 text-sm">{err}</div>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3 font-medium">Created</th>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Campaign ID</th>
              <th className="p-3 font-medium">Owner User ID</th>
              <th className="p-3 font-medium">Members</th>
              <th className="p-3 font-medium">Items</th>
              <th className="p-3 font-medium">Monsters</th>
              <th className="p-3 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 opacity-80" colSpan={8}>
                  Loading campaigns...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className="p-3 opacity-80" colSpan={8}>
                  No campaigns found.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="p-3 align-top">{formatDateTime(row.createdAt)}</td>
                  <td className="p-3 align-top">{row.name}</td>
                  <td className="p-3 align-top font-mono text-xs">{row.id}</td>
                  <td className="p-3 align-top font-mono text-xs">{row.ownerUserId}</td>
                  <td className="p-3 align-top">{row.membersCount}</td>
                  <td className="p-3 align-top">{row.itemsCount}</td>
                  <td className="p-3 align-top">{row.monstersCount}</td>
                  <td className="p-3 align-top">
                    <Link className="underline" href={`/admin/campaigns/${encodeURIComponent(row.id)}`}>
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/*
Route smoke test:
1) Load /admin/campaigns as an admin.
2) Confirm the table shows campaign counts.
3) Click Inspect to open /admin/campaigns/[campaignId].
*/
