"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";

type CampaignRoleRow = {
  role: string;
  canManageCampaign: boolean;
};

type CampaignRow = {
  id: string;
  name: string;
  ownerUserId: string;
  descriptorVersionTag: string;
};

type CampaignMemberRow = {
  userId: string;
  role: string;
  createdAt: string;
  isOwner?: boolean;
  isSyntheticOwner?: boolean;
};

type CampaignMembersPayload = {
  campaign: CampaignRow;
  access: {
    role: string | null;
    isAdmin: boolean;
    isOwner: boolean;
    permissions: {
      canManageCampaign: boolean;
      canUsePlayerCampaignTools: boolean;
    };
  };
  members: CampaignMemberRow[];
  error?: string;
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
  const [members, setMembers] = useState<CampaignMemberRow[]>([]);
  const [addPlayerUserId, setAddPlayerUserId] = useState("");
  const [memberErr, setMemberErr] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);

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
      setMembers([]);
      setMemberErr(null);

      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as CampaignMembersPayload;

        if (res.status === 401) {
          if (!cancelled) router.push("/login");
          return;
        }
        if (res.status === 403) {
          if (!cancelled) setErr("You do not have access to this campaign.");
          return;
        }
        if (res.status === 404) {
          if (!cancelled) setErr("Campaign not found.");
          return;
        }
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load campaign.");
        }

        if (!cancelled) {
          setRoleRow({
            role: data.access.role ?? (data.access.isAdmin ? "ADMIN" : "PLAYER"),
            canManageCampaign: Boolean(data.access.permissions.canManageCampaign),
          });
          setCampaign(data.campaign);
          setMembers(data.members ?? []);
        }
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

  async function handleAddPlayer() {
    if (!campaignId) return;
    const userId = addPlayerUserId.trim();
    if (!userId) {
      setMemberErr("Enter the player's Supabase user ID.");
      return;
    }

    setAddingPlayer(true);
    setMemberErr(null);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to add player.");
      }

      setAddPlayerUserId("");
      const reload = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
        cache: "no-store",
      });
      const reloaded = (await reload.json().catch(() => ({}))) as CampaignMembersPayload;
      if (reload.ok) {
        setMembers(reloaded.members ?? []);
      }
    } catch (e: unknown) {
      setMemberErr(e instanceof Error ? e.message : "Failed to add player.");
    } finally {
      setAddingPlayer(false);
    }
  }

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
  const canDeleteCampaign = Boolean(roleRow?.canManageCampaign);
  const canManageMembers = Boolean(roleRow?.canManageCampaign);

  const tools = useMemo(() => {
    if (!role) return [];

    const base = [
      {
        label: Boolean(roleRow?.canManageCampaign) ? "Character Management" : "Character Builder",
        href: `/campaign/${campaignId}/characters`,
        allowed: Boolean(roleRow?.canManageCampaign) || role === "PLAYER",
      },
    ];

    const gdOnly = [
      {
        label: "The Forge",
        href: `/campaign/${campaignId}/forge`,
        allowed: Boolean(roleRow?.canManageCampaign),
      },
      {
        label: "Summoning Circle",
        href: `/campaign/${campaignId}/summoning-circle`,
        allowed: Boolean(roleRow?.canManageCampaign),
      },
      {
        label: "Inventory",
        href: `/campaign/${campaignId}/inventory`,
        allowed: Boolean(roleRow?.canManageCampaign),
      },
    ];

    return [...gdOnly, ...base].filter((t) => t.allowed);
  }, [campaignId, role, roleRow?.canManageCampaign]);

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

        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">Campaign Members</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Game Directors manage campaign tools. Players can access player-facing campaign tools.
              </p>
            </div>
            {canManageMembers ? (
              <div className="w-full max-w-md space-y-2">
                <label className="block text-xs text-zinc-400" htmlFor="player-user-id">
                  Add Player by Supabase User ID
                </label>
                <div className="flex gap-2">
                  <input
                    id="player-user-id"
                    type="text"
                    value={addPlayerUserId}
                    onChange={(event) => setAddPlayerUserId(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddPlayer()}
                    disabled={addingPlayer}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {addingPlayer ? "Adding..." : "Add"}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Email delivery is not wired yet; share or collect the player&apos;s account ID manually.
                </p>
                {memberErr ? <p className="text-sm text-red-400">{memberErr}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="py-2 pr-3 font-medium">User ID</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td className="py-3 text-zinc-500" colSpan={3}>
                      No campaign members found.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={`${member.userId}-${member.role}`} className="border-b border-zinc-900 last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{member.userId}</td>
                      <td className="py-2 pr-3">{member.role}</td>
                      <td className="py-2 pr-3 text-zinc-400">
                        {member.isOwner ? "Owner" : "Member"}
                        {member.isSyntheticOwner ? " (owner fallback)" : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
