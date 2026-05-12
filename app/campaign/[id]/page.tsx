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
  playerName: string | null;
  email: string | null;
  identityLabel: string;
  confirmationValue: string;
  role: string;
  canManagePartyStash: boolean;
  allowHistoricCharacters: boolean;
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
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [renameErr, setRenameErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [members, setMembers] = useState<CampaignMemberRow[]>([]);
  const [addPlayerUserId, setAddPlayerUserId] = useState("");
  const [addPlayerName, setAddPlayerName] = useState("");
  const [memberNameDrafts, setMemberNameDrafts] = useState<Record<string, string>>({});
  const [memberErr, setMemberErr] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [memberActionErr, setMemberActionErr] = useState<string | null>(null);
  const [memberActionMessage, setMemberActionMessage] = useState<{
    userId: string;
    text: string;
  } | null>(null);
  const [savingMemberNameUserId, setSavingMemberNameUserId] = useState<string | null>(null);
  const [savingPartyStashPermissionUserId, setSavingPartyStashPermissionUserId] = useState<
    string | null
  >(null);
  const [removingMember, setRemovingMember] = useState<CampaignMemberRow | null>(null);
  const [removeStep, setRemoveStep] = useState<"IDLE" | "WARNING" | "CONFIRM">("IDLE");
  const [removeConfirmInput, setRemoveConfirmInput] = useState("");
  const [removingPlayer, setRemovingPlayer] = useState(false);

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
          setMemberNameDrafts(
            Object.fromEntries(
              (data.members ?? []).map((member) => [member.userId, member.playerName ?? ""]),
            ),
          );
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

  async function reloadMembers() {
    if (!campaignId) return;
    const reload = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
      cache: "no-store",
    });
    const reloaded = (await reload.json().catch(() => ({}))) as CampaignMembersPayload;
    if (reload.ok) {
      setMembers(reloaded.members ?? []);
      setMemberNameDrafts(
        Object.fromEntries(
          (reloaded.members ?? []).map((member) => [member.userId, member.playerName ?? ""]),
        ),
      );
    }
  }

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
        body: JSON.stringify({ userId, playerName: addPlayerName }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to add player.");
      }

      setAddPlayerUserId("");
      setAddPlayerName("");
      await reloadMembers();
    } catch (e: unknown) {
      setMemberErr(e instanceof Error ? e.message : "Failed to add player.");
    } finally {
      setAddingPlayer(false);
    }
  }

  async function handleToggleHistoricCharacters(member: CampaignMemberRow, value: boolean) {
    if (!campaignId) return;
    setMemberActionErr(null);
    setMemberActionMessage(null);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.userId,
          allowHistoricCharacters: value,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update historic character policy.");
      }
      await reloadMembers();
    } catch (error: unknown) {
      setMemberActionErr(
        error instanceof Error ? error.message : "Failed to update historic character policy.",
      );
    }
  }

  async function handleTogglePartyStashManagement(member: CampaignMemberRow, value: boolean) {
    if (!campaignId) return;
    setMemberActionErr(null);
    setMemberActionMessage(null);
    setSavingPartyStashPermissionUserId(member.userId);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.userId,
          canManagePartyStash: value,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update Party Stash permission.");
      }
      await reloadMembers();
      setMemberActionMessage({
        userId: member.userId,
        text: value ? "Party Stash permission enabled" : "Party Stash permission disabled",
      });
    } catch (error: unknown) {
      setMemberActionErr(
        error instanceof Error ? error.message : "Failed to update Party Stash permission.",
      );
    } finally {
      setSavingPartyStashPermissionUserId(null);
    }
  }

  async function handleSavePlayerName(member: CampaignMemberRow) {
    if (!campaignId) return;
    setMemberActionErr(null);
    setMemberActionMessage(null);
    setSavingMemberNameUserId(member.userId);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.userId,
          playerName: memberNameDrafts[member.userId] ?? "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update Player Name.");
      }
      await reloadMembers();
      setMemberActionMessage({
        userId: member.userId,
        text:
          member.role === "GAME_DIRECTOR"
            ? "Game Director name updated"
            : "Player name updated",
      });
    } catch (error: unknown) {
      setMemberActionErr(error instanceof Error ? error.message : "Failed to update Player Name.");
    } finally {
      setSavingMemberNameUserId(null);
    }
  }

  async function handleRemovePlayer() {
    if (!campaignId || !removingMember) return;
    setRemovingPlayer(true);
    setMemberActionErr(null);
    setMemberActionMessage(null);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: removingMember.userId,
          confirmation: removeConfirmInput.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to remove player.");
      }

      setRemovingMember(null);
      setRemoveStep("IDLE");
      setRemoveConfirmInput("");
      await reloadMembers();
    } catch (error: unknown) {
      setMemberActionErr(error instanceof Error ? error.message : "Failed to remove player.");
    } finally {
      setRemovingPlayer(false);
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

  async function handleRenameCampaign() {
    if (!campaignId) return;

    const nextName = renameInput.trim();
    if (!nextName) {
      setRenameErr("Enter a new campaign name.");
      return;
    }

    setRenaming(true);
    setRenameErr(null);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nextName,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        campaign?: CampaignRow;
        error?: string;
      };

      if (!res.ok || !data.campaign) {
        throw new Error(data.error ?? "Failed to rename campaign.");
      }

      setCampaign(data.campaign);
      setRenameOpen(false);
      setRenameInput("");
    } catch (e: unknown) {
      setRenameErr(e instanceof Error ? e.message : "Failed to rename campaign.");
    } finally {
      setRenaming(false);
    }
  }

  const role = roleRow?.role ?? null;
  const campaignName = campaign?.name ?? "Campaign";
  const descriptorTag = campaign?.descriptorVersionTag ?? "v0";
  const canDeleteCampaign = Boolean(roleRow?.canManageCampaign);
  const canRenameCampaign = Boolean(roleRow?.canManageCampaign);
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
        label: "Party Inventory",
        href: `/campaign/${campaignId}/inventory`,
        allowed: Boolean(roleRow?.canManageCampaign) || role === "PLAYER",
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

          {canDeleteCampaign || canRenameCampaign ? (
            <div className="flex flex-wrap gap-2">
              {canRenameCampaign ? (
                <button
                  type="button"
                  onClick={() => {
                    setRenameErr(null);
                    setRenameInput("");
                    setRenameOpen(true);
                  }}
                  className="rounded-lg border border-blue-500 bg-blue-700 px-4 py-2 font-semibold text-blue-50 hover:bg-blue-600"
                >
                  Rename Campaign
                </button>
              ) : null}
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
            </div>
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

        <section
          className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
          data-testid="campaign-members-panel"
        >
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
                <label className="block text-xs text-zinc-400" htmlFor="player-display-name">
                  Player Name
                </label>
                <input
                  id="player-display-name"
                  type="text"
                  value={addPlayerName}
                  onChange={(event) => setAddPlayerName(event.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                  placeholder="e.g. Dani"
                />
                <p className="text-[11px] text-zinc-500">
                  Temporary dev bridge: email delivery is not wired yet, so adding still uses the player&apos;s account ID.
                </p>
                {memberErr ? <p className="text-sm text-red-400">{memberErr}</p> : null}
                {memberActionErr ? <p className="text-sm text-red-400">{memberActionErr}</p> : null}
                {memberActionMessage ? (
                  <p className="text-sm text-emerald-400">{memberActionMessage.text}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="py-2 pr-3 font-medium">Player</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  {canManageMembers ? (
                    <th className="py-2 pr-3 font-medium">Status</th>
                  ) : null}
                  {canManageMembers ? (
                    <th className="py-2 pr-3 font-medium">Historic Characters</th>
                  ) : null}
                  {canManageMembers ? (
                    <th className="py-2 pr-3 font-medium">Party Stash</th>
                  ) : null}
                  {canManageMembers ? (
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td className="py-3 text-zinc-500" colSpan={canManageMembers ? 6 : 2}>
                      No campaign members found.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr
                      key={`${member.userId}-${member.role}`}
                      className="border-b border-zinc-900 last:border-0"
                      data-testid="campaign-member-row"
                    >
                      <td className="py-2 pr-3">
                        {canManageMembers ? (
                          <div className="space-y-2">
                            <label className="block text-[11px] text-zinc-500">
                              {member.role === "GAME_DIRECTOR" ? "GD Name" : "Player Name"}
                            </label>
                            <input
                              type="text"
                              value={memberNameDrafts[member.userId] ?? ""}
                              onChange={(event) => {
                                setMemberActionMessage(null);
                                setMemberNameDrafts((current) => ({
                                  ...current,
                                  [member.userId]: event.target.value,
                                }));
                              }}
                              className="w-full rounded border border-zinc-700 bg-black px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                              placeholder={
                                member.role === "GAME_DIRECTOR"
                                  ? "Game Director Name"
                                  : "Player Name"
                              }
                            />
                            <div className="text-xs text-zinc-400">
                              Email: {member.email ?? "Email unavailable"}
                            </div>
                            <div className="font-mono text-[11px] text-zinc-500">
                              {member.userId}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div>{member.identityLabel}</div>
                            {canManageMembers ? (
                              <>
                                <div className="text-xs text-zinc-400">
                                  Email: {member.email ?? "Email unavailable"}
                                </div>
                                <div className="font-mono text-[11px] text-zinc-500">
                                  {member.userId}
                                </div>
                              </>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">{member.role}</td>
                      {canManageMembers ? (
                        <td className="py-2 pr-3 text-zinc-400">
                          {member.isOwner ? "Owner" : "Member"}
                          {member.isSyntheticOwner ? " (owner fallback)" : ""}
                        </td>
                      ) : null}
                      {canManageMembers ? (
                        <td className="py-2 pr-3">
                          {member.role === "PLAYER" ? (
                            <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                              <input
                                type="checkbox"
                                checked={member.allowHistoricCharacters}
                                onChange={(event) => {
                                  void handleToggleHistoricCharacters(member, event.target.checked);
                                }}
                              />
                              Allow
                            </label>
                          ) : (
                            <span className="text-zinc-500">n/a</span>
                          )}
                        </td>
                      ) : null}
                      {canManageMembers ? (
                        <td className="py-2 pr-3">
                          {member.role === "PLAYER" ? (
                            <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                              <input
                                type="checkbox"
                                checked={member.canManagePartyStash}
                                disabled={savingPartyStashPermissionUserId === member.userId}
                                onChange={(event) => {
                                  void handleTogglePartyStashManagement(
                                    member,
                                    event.target.checked,
                                  );
                                }}
                              />
                              {savingPartyStashPermissionUserId === member.userId
                                ? "Saving..."
                                : "Can assign"}
                            </label>
                          ) : (
                            <span className="text-zinc-500">n/a</span>
                          )}
                        </td>
                      ) : null}
                      {canManageMembers ? (
                        <td className="space-y-2 py-2 pr-3">
                          <>
                            <button
                              type="button"
                              onClick={() => void handleSavePlayerName(member)}
                              disabled={savingMemberNameUserId === member.userId}
                              className="block rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingMemberNameUserId === member.userId
                                ? "Saving..."
                                : member.role === "GAME_DIRECTOR"
                                  ? "Save GD Name"
                                  : "Save Name"}
                            </button>
                            {memberActionMessage?.userId === member.userId ? (
                              <p className="text-xs text-emerald-400">
                                {memberActionMessage.text}
                              </p>
                            ) : null}
                            {member.role === "PLAYER" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setMemberActionErr(null);
                                  setMemberActionMessage(null);
                                  setRemovingMember(member);
                                  setRemoveConfirmInput("");
                                  setRemoveStep("WARNING");
                                }}
                                className="block rounded-lg border border-red-700 px-3 py-1 text-xs text-red-200 hover:bg-red-950/30"
                              >
                                Remove Player
                              </button>
                            ) : (
                              <span className="block text-xs text-zinc-500">Protected</span>
                            )}
                          </>
                        </td>
                      ) : null}
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

      {renameOpen && canRenameCampaign ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-blue-700 bg-zinc-950 p-6">
            <h2 className="text-xl font-semibold text-blue-100">Rename Campaign?</h2>
            <div className="space-y-2">
              <label className="block text-sm text-zinc-300" htmlFor="rename-campaign-name">
                New campaign name
              </label>
              <input
                id="rename-campaign-name"
                type="text"
                value={renameInput}
                onChange={(event) => setRenameInput(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-zinc-100 outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
            {renameErr ? <p className="text-sm text-red-400">{renameErr}</p> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRenameOpen(false);
                  setRenameInput("");
                  setRenameErr(null);
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
                disabled={renaming}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRenameCampaign()}
                className="rounded-lg border border-blue-500 bg-blue-700 px-4 py-2 font-semibold text-blue-50 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={renaming}
              >
                {renaming ? "Renaming..." : "RENAME"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      {removeStep === "WARNING" && removingMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-xl space-y-4 rounded-xl border-2 border-red-700 bg-zinc-950 p-6">
            <h2 className="text-xl font-semibold text-red-200">Remove Player</h2>
            <p className="text-sm text-zinc-300">
              This player will be removed from the campaign. Their character will be archived. Are you sure?
            </p>
            <div className="rounded-lg border border-zinc-800 bg-black p-3 text-sm">
              <div>{removingMember.identityLabel}</div>
              {removingMember.email ? <div className="text-zinc-400">{removingMember.email}</div> : null}
              <div className="font-mono text-xs text-zinc-500">{removingMember.userId}</div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRemovingMember(null);
                  setRemoveStep("IDLE");
                  setRemoveConfirmInput("");
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setRemoveStep("CONFIRM");
                  setRemoveConfirmInput("");
                }}
                className="rounded-lg border-2 border-red-600 px-4 py-2 font-semibold text-red-200 hover:bg-red-950/30"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeStep === "CONFIRM" && removingMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-xl space-y-4 rounded-xl border-2 border-red-700 bg-zinc-950 p-6">
            <h2 className="text-xl font-semibold text-red-200">Confirm Player Removal</h2>
            <p className="text-sm text-zinc-300">
              Type the player identity in full to remove them and archive their assigned characters.
            </p>
            <div className="rounded-lg border border-zinc-800 bg-black p-3 text-sm">
              <div className="text-zinc-400">Required confirmation</div>
              <div className="font-mono text-xs text-zinc-200">{removingMember.confirmationValue}</div>
            </div>
            <input
              type="text"
              value={removeConfirmInput}
              onChange={(event) => setRemoveConfirmInput(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-zinc-100 outline-none focus:border-red-500"
              placeholder={removingMember.confirmationValue}
              autoFocus
            />
            {memberActionErr ? <p className="text-sm text-red-400">{memberActionErr}</p> : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRemovingMember(null);
                  setRemoveStep("IDLE");
                  setRemoveConfirmInput("");
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 hover:bg-zinc-900"
                disabled={removingPlayer}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRemovePlayer()}
                className="rounded-lg border-2 border-red-600 px-4 py-2 font-semibold text-red-200 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={removingPlayer || removeConfirmInput.trim() !== removingMember.confirmationValue}
              >
                {removingPlayer ? "Removing..." : "Remove Player"}
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
