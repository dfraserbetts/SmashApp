"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type CampaignRow = {
  id: string;
  name: string;
  descriptorVersionTag: string;
};

type CampaignUserRow = {
  role: "GAME_DIRECTOR" | "PLAYER";
  campaign: CampaignRow | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<CampaignUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const campaigns = useMemo(
    () => rows.map((r) => r.campaign).filter(Boolean) as CampaignRow[],
    [rows],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErr(null);
      setLoading(true);

      const supabaseClient = getSupabaseBrowserClient();
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const u = sessionData.session?.user;
      if (!u) {
        router.replace("/login");
        return;
      }

      if (cancelled) return;
      setUserId(u.id);

      // Pull memberships + campaign details
      const { data, error } = await supabaseClient
        .from("CampaignUser")
        .select("role, campaign:Campaign(id,name,descriptorVersionTag)")
        .eq("userId", u.id);

      if (cancelled) return;

      if (error) {
        setErr(error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as CampaignUserRow[]);
      }

      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function createCampaign() {
    setCreating(true);
    setErr(null);

    try {
      const supabaseClient = getSupabaseBrowserClient();
      // Always derive the acting user from Supabase at the moment of action
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (userError) {
        setErr(`getUser failed: ${userError.message}`);
        return;
      }

      if (!user?.id) {
        setErr("You must be logged in to create a campaign.");
        router.replace("/login");
        return;
      }

      const name = prompt("Campaign name?");
      if (!name?.trim()) return;

    // 1) Create campaign + membership server-side (cookie auth)
    const res = await fetch("/api/campaigns", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json?.id) {
      setErr(json?.error ?? "Failed to create campaign");
      return;
    }

    // Go to campaign home
    router.push(`/campaign/${json.id}`);

    } finally {
      setCreating(false);
    }
  }

  async function signOut() {
    const supabaseClient = getSupabaseBrowserClient();
    await supabaseClient.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Campaigns</h1>
            <p className="text-sm text-zinc-400">
              Pick a campaign. Your role decides which tools you can use.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={createCampaign}
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "New Campaign"}
            </button>
            <button
              onClick={signOut}
              className="px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-900"
            >
              Sign out
            </button>
          </div>
        </header>

        {loading && <p className="text-zinc-400">Loading campaigns...</p>}

        {err && (
          <p className="text-red-400">
            {err}
            <br />
            <span className="text-zinc-500">
              If this says table not found, your PostgREST is choking on
              capitalized table names. Then we rename maps to snake_case.
            </span>
          </p>
        )}

        {!loading && !err && campaigns.length === 0 && (
          <p className="text-zinc-400">
            No campaigns yet. Create one. (Your first quest.)
          </p>
        )}

        <div className="grid gap-3">
          {rows
            .filter((r) => r.campaign)
            .map((r) => (
              <Link
                key={r.campaign!.id}
                href={`/campaign/${r.campaign!.id}`}
                className="block rounded-xl border border-zinc-800 p-4 hover:bg-zinc-900"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold">{r.campaign!.name}</div>
                    <div className="text-sm text-zinc-400">
                      Descriptor: {r.campaign!.descriptorVersionTag}
                    </div>
                  </div>
                  <div className="text-xs rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
                    {r.role === "GAME_DIRECTOR" ? "Game Director" : "Player"}
                  </div>
                </div>
              </Link>
            ))}
        </div>
      </div>
    </main>
  );
}
