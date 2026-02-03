'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabaseClient } from "@/lib/supabaseClient";

type CampaignRole = "PLAYER" | "GAME_DIRECTOR";

type CampaignRoleRow = {
  role: string;
};

type CampaignRow = {
  name: string;
  descriptorVersionTag: string;
};

export default function CampaignHomePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campaignId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [roleRow, setRoleRow] = useState<CampaignRoleRow | null>(null);
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);

  useEffect(() => {
  let cancelled = false;

  async function load() {
    if (!campaignId) {
      setErr("Missing campaign id.");
      setLoading(false);
      return;
    }

  setLoading(true);
  setErr(null);
  setRoleRow(null);
  setCampaign(null);


    try {
      const supabase = supabaseClient;
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.user?.id) {
        if (!cancelled) router.push("/login");
        return;
      }

      // 1) Membership / role
      const { data: membership, error: memberError } = await supabase
        .from("CampaignUser")
        .select("role")
        .eq("campaignId", campaignId)
        .eq("userId", session.user.id)
        .maybeSingle();

      if (memberError) throw memberError;

      if (!membership) {
        if (!cancelled) setErr("You do not have access to this campaign.");
        return;
      }

      if (!cancelled) setRoleRow(membership);

      // 2) Campaign details
      const { data: camp, error: campError } = await supabase
        .from("Campaign")
        .select("name, descriptorVersionTag")
        .eq("id", campaignId)
        .maybeSingle();

      if (campError) throw campError;

      // If membership exists but campaign row doesn't, that's data corruption or a deleted campaign.
      if (!camp) {
        if (!cancelled) setErr("Campaign not found.");
        return;
      }

      if (!cancelled) setCampaign(camp);

    } catch (e: any) {
      if (!cancelled) setErr(e?.message ?? "Failed to load campaign.");
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  load();

  return () => {
    cancelled = true;
  };
}, [campaignId, router]);

  const role = roleRow?.role ?? null;
  const campaignName = campaign?.name ?? "Campaign";
  const descriptorTag = campaign?.descriptorVersionTag ?? "v0";

  const tools = useMemo(() => {
    if (!role) return [];

    const base = [
      {
        label: 'Character Builder',
        href: `/campaign/${campaignId}/characters`,
        allowed: role === 'GAME_DIRECTOR' || role === 'PLAYER',
      },
    ];

    const gdOnly = [
      {
        label: 'The Forge',
        href: `/campaign/${campaignId}/forge`,
        allowed: role === 'GAME_DIRECTOR',
      },
      {
        label: 'Summoning Circle',
        href: `/campaign/${campaignId}/summoning`,
        allowed: role === 'GAME_DIRECTOR',
      },
      {
        label: 'Inventory',
        href: `/campaign/${campaignId}/inventory`,
        allowed: role === 'GAME_DIRECTOR',
      },
    ];

    return [...gdOnly, ...base].filter((t) => t.allowed);
  }, [campaignId, role]);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-6">
        <div className="text-zinc-400">Loading campaign…</div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-black text-zinc-100 p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <h1 className="text-xl font-semibold">Campaign</h1>
          <p className="text-red-400">{err}</p>
          <button
            onClick={() => router.replace('/dashboard')}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Back to campaigns
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <div className="text-sm text-zinc-400">
            Descriptor set: <span className="text-zinc-200">{descriptorTag}</span>
          </div>
          <h1 className="text-2xl font-semibold">{campaignName}</h1>
          <p className="text-sm text-zinc-400">
            Role: <span className="text-zinc-200">{role}</span>
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          {tools.map((t) => (
            <button
              key={t.href}
              onClick={() => router.push(t.href)}
              className="text-left p-4 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900"
            >
              <div className="font-semibold">{t.label}</div>
              <div className="text-sm text-zinc-400">
                Open {t.label}.
              </div>
            </button>
          ))}
        </section>

        <div className="pt-2">
          <button
            onClick={() => router.replace('/dashboard')}
            className="px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-950"
          >
            Back to campaigns
          </button>
        </div>
      </div>
    </main>
  );
}
