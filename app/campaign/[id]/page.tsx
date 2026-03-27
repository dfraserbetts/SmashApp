"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

type CampaignRoleRow = {
  role: string;
};

type CampaignRow = {
  name: string;
  descriptorVersionTag: string;
};

export default function CampaignHomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const isForge = pathname.endsWith("/forge");
  const params = useParams<{ id: string }>();
  const campaignId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [roleRow, setRoleRow] = useState<CampaignRoleRow | null>(null);
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [deleteStep, setDeleteStep] = useState<"IDLE" | "WARNING" | "CONFIRM">("IDLE");
  const [deleteNameInput, setDeleteNameInput] = useState("");
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

        const { data: camp, error: campError } = await supabase
          .from("Campaign")
          .select("name, descriptorVersionTag")
          .eq("id", campaignId)
          .maybeSingle();

        if (campError) throw campError;

        if (!camp) {
          if (!cancelled) setErr("Campaign not found.");
          return;
        }

        if (!cancelled) setCampaign(camp);
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : "Failed to load campaign.";
          setErr(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [campaignId, router]);

  async function handleDeleteCampaign() {
    if (!campaignId || !campaign?.name) return;

    const typedName = deleteNameInput.trim();
    if (typedName !== campaign.name) {
      setDeleteErr("Campaign name does not match.");
      return;
    }

    setDeleting(true);
    setDeleteErr(null);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignName: typedName,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete campaign");
      }

      router.replace("/dashboard");
    } catch (e: unknown) {
      setDeleteErr(
        e instanceof Error ? e.message : "Failed to delete campaign.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const role = roleRow?.role ?? null;
  const campaignName = campaign?.name ?? "Campaign";
  const descriptorTag = campaign?.descriptorVersionTag ?? "v0";
  const canDeleteCampaign = role === "GAME_DIRECTOR";

  const tools = useMemo(() => {
    if (!role) return [];

    const base = [
      {
        label: "Character Builder",
        href: `/campaign/${campaignId}/characters`,
        allowed: role === "GAME_DIRECTOR" || role === "PLAYER",
      },
    ];

    const gdOnly = [
      {
        label: "The Forge",
        href: `/campaign/${campaignId}/forge`,
        allowed: role === "GAME_DIRECTOR",
      },
      {
        label: "Summoning Circle",
        href: `/campaign/${campaignId}/summoning-circle`,
        allowed: role === "GAME_DIRECTOR",
      },
      {
        label: "Inventory",
        href: `/campaign/${campaignId}/inventory`,
        allowed: role === "GAME_DIRECTOR",
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
        <div
          className={
            isForge
              ? "w-full space-y-4"
              : "max-w-2xl mx-auto space-y-4"
          }
        >
          <h1 className="text-xl font-semibold">Campaign</h1>
          <p className="text-red-400">{err}</p>
          <button
            onClick={() => router.replace("/dashboard")}
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
      <div
        className={
          isForge
            ? "w-full space-y-6"
            : "max-w-4xl mx-auto space-y-6"
        }
      >
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm text-zinc-400">
              Descriptor set: <span className="text-zinc-200">{descriptorTag}</span>
            </div>
            <h1 className="text-2xl font-semibold">{campaignName}</h1>
            <p className="text-sm text-zinc-400">
              Role: <span className="text-zinc-200">{role}</span>
            </p>
          </div>

          {canDeleteCampaign ? (
            <button
              type="button"
              onClick={() => {
                setDeleteErr(null);
                setDeleteNameInput("");
                setDeleteStep("WARNING");
              }}
              className="rounded-lg border-4 border-red-600 px-4 py-2 font-semibold text-red-200 hover:bg-red-950/30"
            >
              Delete Campaign
            </button>
          ) : null}
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
            onClick={() => router.replace("/dashboard")}
            className="px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-950"
          >
            Back to campaigns
          </button>
        </div>
      </div>

      {deleteStep === "WARNING" && canDeleteCampaign ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-xl space-y-4 rounded-xl border-2 border-red-700 bg-zinc-950 p-6">
            <h2 className="text-xl font-semibold text-red-200">Delete Campaign</h2>
            <p className="text-sm text-zinc-300">
              Deleting a campaign will remove all campaign Items, Monsters and Characters.
              This is permanent and cannot be undone. Are you sure you wish to Delete
              campaign {campaignName}?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => router.replace("/dashboard")}
                className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteErr(null);
                  setDeleteNameInput("");
                  setDeleteStep("CONFIRM");
                }}
                className="rounded-lg border-2 border-red-600 px-4 py-2 font-semibold text-red-200 hover:bg-red-950/30"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteStep === "CONFIRM" && canDeleteCampaign ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-xl space-y-4 rounded-xl border-2 border-red-700 bg-zinc-950 p-6">
            <h2 className="text-xl font-semibold text-red-200">Confirm Campaign Deletion</h2>
            <p className="text-sm text-zinc-300">
              Enter the campaign name in full to confirm deletion.
            </p>
            <div className="space-y-2">
              <label className="block text-sm text-zinc-300" htmlFor="delete-campaign-name">
                Campaign name
              </label>
              <input
                id="delete-campaign-name"
                type="text"
                value={deleteNameInput}
                onChange={(event) => setDeleteNameInput(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-zinc-100 outline-none focus:border-red-500"
                placeholder={campaignName}
                autoFocus
              />
            </div>
            {deleteErr ? <p className="text-sm text-red-400">{deleteErr}</p> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => router.replace("/dashboard")}
                className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteCampaign()}
                className="rounded-lg border-2 border-red-600 px-4 py-2 font-semibold text-red-200 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "CONFIRM"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
