"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// [ANCHOR:ADMIN_CAMPAIGN_DETAIL_PAGE]

type CampaignCore = {
  id: string;
  createdAt: string;
  name: string;
  ownerUserId: string;
  descriptorVersionTag: string;
};

type MemberRow = {
  userId: string;
  role: string;
  createdAt: string;
};

type ItemRow = {
  id: string;
  name: string;
  type: string;
  level: number;
  rarity: string;
  ppv: number | null;
  mpv: number | null;
  armorLocation: string | null;
  itemLocation: string | null;
  raw: unknown;
};

type MonsterRow = {
  id: string;
  name: string;
  level: number;
  tier: string;
  legendary: boolean;
  source: string;
  raw: unknown;
};

type CampaignDetailPayload = {
  campaign: CampaignCore;
  members: MemberRow[];
  items: ItemRow[];
  monsters: MonsterRow[];
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getItemWarnings(item: ItemRow): string[] {
  // [ANCHOR:ADMIN_CAMPAIGN_ITEM_FLAGS]
  const out: string[] = [];
  const type = String(item.type ?? "").toUpperCase();
  const ppv = item.ppv ?? 0;
  const mpv = item.mpv ?? 0;
  const isNullPV = item.ppv == null && item.mpv == null;
  const isZeroPV = ppv === 0 && mpv === 0;
  const hasAnyPV = ppv > 0 || mpv > 0;

  if (type === "ARMOR" || type === "SHIELD") {
    if (isZeroPV) {
      out.push("Zero PPV/MPV");
    }
    if (isNullPV) {
      out.push("Null PPV/MPV");
    }
  }

  if (type === "WEAPON" && hasAnyPV) {
    out.push("PV on weapon?");
  }

  return out;
}

export default function AdminCampaignDetailPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = useMemo(() => String(params?.campaignId ?? "").trim(), [params?.campaignId]);

  const [payload, setPayload] = useState<CampaignDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!campaignId) {
      setErr("Missing campaign id");
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/admin/campaigns/${encodeURIComponent(campaignId)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as CampaignDetailPayload & { error?: string };

      if (res.status === 404) {
        setNotFound(true);
        setPayload(null);
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load campaign");
      }
      setPayload(data);
    } catch (e: unknown) {
      setErr(String((e as { message?: unknown })?.message ?? "Failed to load campaign"));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm">
        <Link className="underline" href="/admin">
          {"<-"} Back to Admin Dashboard
        </Link>
        <Link className="underline" href="/admin/campaigns">
          {"<-"} Back to Campaign List
        </Link>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="text-lg font-medium">ADMIN: Campaign Inspector</h2>
        <p className="mt-1 text-sm opacity-80">
          Campaign deep inspection view. {/* GM Scrying Orb mode enabled. */}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="rounded border px-4 py-2 text-sm" onClick={load}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded border p-3 text-sm opacity-80">Loading campaign...</div>
      ) : notFound ? (
        <div className="rounded border p-3 text-sm">Campaign not found (404).</div>
      ) : err ? (
        <div className="rounded border p-3 text-sm">{err}</div>
      ) : !payload ? (
        <div className="rounded border p-3 text-sm">No data returned.</div>
      ) : (
        <>
          <div className="rounded-lg border p-4">
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <div>
                <span className="opacity-70">Name:</span> {payload.campaign.name}
              </div>
              <div>
                <span className="opacity-70">Created:</span>{" "}
                {formatDateTime(payload.campaign.createdAt)}
              </div>
              <div>
                <span className="opacity-70">Campaign ID:</span>{" "}
                <span className="font-mono text-xs">{payload.campaign.id}</span>
              </div>
              <div>
                <span className="opacity-70">Owner User ID:</span>{" "}
                <span className="font-mono text-xs">{payload.campaign.ownerUserId}</span>
              </div>
              <div>
                <span className="opacity-70">Descriptor Version:</span>{" "}
                {payload.campaign.descriptorVersionTag}
              </div>
            </div>
          </div>

          <section className="rounded-lg border">
            <div className="border-b p-3 text-sm font-medium">
              Members ({payload.members.length})
            </div>
            <div className="overflow-x-auto overflow-y-visible">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">User ID</th>
                    <th className="p-3 font-medium">Role</th>
                    <th className="p-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.members.length === 0 ? (
                    <tr>
                      <td className="p-3 opacity-80" colSpan={3}>
                        No members.
                      </td>
                    </tr>
                  ) : (
                    payload.members.map((member) => (
                      <tr key={`${member.userId}-${member.createdAt}`} className="border-b last:border-0">
                        <td className="p-3 font-mono text-xs">{member.userId}</td>
                        <td className="p-3">{member.role}</td>
                        <td className="p-3">{formatDateTime(member.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border">
            <div className="border-b p-3 text-sm font-medium">Items ({payload.items.length})</div>
            <div className="overflow-x-auto overflow-y-visible">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">ID</th>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Level</th>
                    <th className="p-3 font-medium">Rarity</th>
                    <th className="p-3 font-medium">PPV</th>
                    <th className="p-3 font-medium">MPV</th>
                    <th className="p-3 font-medium">Armor Location</th>
                    <th className="p-3 font-medium">Item Location</th>
                    <th className="p-3 font-medium">Flags</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.items.length === 0 ? (
                    <tr>
                      <td className="p-3 opacity-80" colSpan={11}>
                        No forged items in this campaign.
                      </td>
                    </tr>
                  ) : (
                    payload.items.map((item) => {
                      const warnings = getItemWarnings(item);
                      return (
                        <tr key={item.id} className="border-b last:border-0 align-top">
                          <td className="p-3 font-mono text-xs">{item.id}</td>
                          <td className="p-3">{item.name}</td>
                          <td className="p-3">{item.type}</td>
                          <td className="p-3">{item.level}</td>
                          <td className="p-3">{item.rarity}</td>
                          <td className="p-3">{item.ppv ?? "-"}</td>
                          <td className="p-3">{item.mpv ?? "-"}</td>
                          <td className="p-3">{item.armorLocation ?? "-"}</td>
                          <td className="p-3">{item.itemLocation ?? "-"}</td>
                          <td className="p-3">
                            {warnings.length === 0 ? (
                              <span className="opacity-70">-</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {warnings.map((warning) => (
                                  <span key={warning} className="rounded border px-2 py-0.5 text-xs">
                                    {warning}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap items-start gap-3 text-xs">
                              {/* GM teleport sigil: jump directly into the live editor with this record */}
                              <Link
                                href={`/campaign/${campaignId}/forge?itemId=${item.id}`}
                                className="text-xs underline text-indigo-400 hover:text-indigo-300"
                              >
                                Open in Forge
                              </Link>
                              <details className="inline-block">
                                <summary className="cursor-pointer text-xs underline">View JSON</summary>
                                <pre className="mt-2 max-h-[420px] overflow-auto rounded border border-zinc-700 bg-zinc-950/60 p-2 text-xs whitespace-pre-wrap break-words">
                                  {JSON.stringify(item.raw, null, 2)}
                                </pre>
                              </details>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border">
            <div className="border-b p-3 text-sm font-medium">
              Monsters ({payload.monsters.length})
            </div>
            <div className="overflow-x-auto overflow-y-visible">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">ID</th>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Level</th>
                    <th className="p-3 font-medium">Tier</th>
                    <th className="p-3 font-medium">Legendary</th>
                    <th className="p-3 font-medium">Source</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.monsters.length === 0 ? (
                    <tr>
                      <td className="p-3 opacity-80" colSpan={7}>
                        No monsters in this campaign.
                      </td>
                    </tr>
                  ) : (
                    payload.monsters.map((monster) => (
                      <tr key={monster.id} className="border-b last:border-0 align-top">
                        <td className="p-3 font-mono text-xs">{monster.id}</td>
                        <td className="p-3">{monster.name}</td>
                        <td className="p-3">{monster.level}</td>
                        <td className="p-3">{monster.tier}</td>
                        <td className="p-3">{monster.legendary ? "Yes" : "No"}</td>
                        <td className="p-3">{monster.source}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-start gap-3 text-xs">
                            <Link
                              href={`/campaign/${campaignId}/summoning-circle?monsterId=${monster.id}`}
                              className="text-xs underline text-emerald-400 hover:text-emerald-300"
                            >
                              Open in Summoning Circle
                            </Link>
                            <details className="inline-block">
                              <summary className="cursor-pointer text-xs underline">View JSON</summary>
                              <pre className="mt-2 max-h-[420px] overflow-auto rounded border border-zinc-700 bg-zinc-950/60 p-2 text-xs whitespace-pre-wrap break-words">
                                {JSON.stringify(monster.raw, null, 2)}
                              </pre>
                            </details>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/*
Route smoke test:
1) Load /admin/campaigns as an admin.
2) Open a campaign detail page.
3) Verify members, items, and monsters lists render with View JSON toggles.
*/
