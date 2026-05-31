"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type InviteDetail = {
  invite: {
    id: string;
    campaignId: string;
    campaignName: string;
    playerName: string | null;
    createdAt: string;
  };
  currentPlayers: Array<{ playerNameOrLabel: string }>;
  error?: string;
};

export default function CampaignInvitePage() {
  const router = useRouter();
  const params = useParams<{ inviteId: string }>();
  const inviteId = Array.isArray(params?.inviteId) ? params.inviteId[0] : params?.inviteId;

  const [detail, setDetail] = useState<InviteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState(false);
  const [acting, setActing] = useState<"accept" | "reject" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!inviteId) {
        setErr("Missing invite id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErr(null);

      try {
        const res = await fetch(`/api/campaign-invites/${encodeURIComponent(inviteId)}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as InviteDetail;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          throw new Error(data.error ?? "Campaign invite could not be loaded.");
        }
        if (!cancelled) setDetail(data);
      } catch (error) {
        if (!cancelled) {
          setErr(error instanceof Error ? error.message : "Campaign invite could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [inviteId, router]);

  async function acceptInvite() {
    if (!inviteId) return;
    setActing("accept");
    setErr(null);

    try {
      const res = await fetch(`/api/campaign-invites/${encodeURIComponent(inviteId)}/accept`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        campaignId?: string;
        error?: string;
      };
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok || !data.campaignId) {
        throw new Error(data.error ?? "Failed to join campaign.");
      }
      router.push(`/campaign/${data.campaignId}`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to join campaign.");
      setActing(null);
    }
  }

  async function rejectInvite() {
    if (!inviteId) return;
    setActing("reject");
    setErr(null);

    try {
      const res = await fetch(`/api/campaign-invites/${encodeURIComponent(inviteId)}/reject`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to reject invite.");
      }
      router.replace("/dashboard");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to reject invite.");
      setActing(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-zinc-100">
        <p className="text-zinc-400">Loading invite...</p>
      </main>
    );
  }

  if (err || !detail) {
    return (
      <main className="min-h-screen bg-black p-6 text-zinc-100">
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-xl font-semibold">Campaign Invite</h1>
          <p className="text-red-400">{err ?? "Campaign invite could not be loaded."}</p>
          <button
            type="button"
            onClick={() => router.replace("/dashboard")}
            className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <div className="text-sm text-emerald-300">Invite Pending</div>
          <h1 className="text-2xl font-semibold">{detail.invite.campaignName}</h1>
          {detail.invite.playerName ? (
            <p className="text-sm text-zinc-400">Player name: {detail.invite.playerName}</p>
          ) : null}
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="font-semibold">Current campaign players</h2>
          <div className="mt-3 grid gap-2">
            {detail.currentPlayers.length === 0 ? (
              <p className="text-sm text-zinc-500">No current players listed.</p>
            ) : (
              detail.currentPlayers.map((player, index) => (
                <div
                  key={`${player.playerNameOrLabel}-${index}`}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300"
                >
                  {player.playerNameOrLabel}
                </div>
              ))
            )}
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void acceptInvite()}
            disabled={acting !== null}
            className="rounded-lg border border-emerald-500 px-4 py-2 font-semibold text-emerald-100 hover:bg-emerald-950/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {acting === "accept" ? "Joining..." : "Join Campaign"}
          </button>
          <button
            type="button"
            onClick={() => setRejectConfirm(true)}
            disabled={acting !== null}
            className="rounded-lg border border-red-600 px-4 py-2 font-semibold text-red-200 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reject Invite
          </button>
          <button
            type="button"
            onClick={() => router.replace("/dashboard")}
            className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {rejectConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-red-700 bg-zinc-950 p-6">
            <h2 className="text-xl font-semibold text-red-200">Reject Invite?</h2>
            <p className="text-sm text-zinc-300">
              Please confirm you would like to reject the campaign invitation?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRejectConfirm(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
                disabled={acting !== null}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => void rejectInvite()}
                className="rounded-lg border border-red-600 px-4 py-2 font-semibold text-red-200 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={acting !== null}
              >
                {acting === "reject" ? "Rejecting..." : "Yes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
