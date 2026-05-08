"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type CampaignRow = {
  id: string;
  name: string;
  ownerUserId: string;
  descriptorVersionTag: string;
};

type CampaignCharacterRow = {
  id: string;
  campaignId: string;
  name: string;
  assignedUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type PlayerMemberRow = {
  userId: string;
  role: string;
  createdAt: string;
};

type CharactersPayload = {
  campaign: CampaignRow;
  access: {
    userId: string;
    role: string | null;
    isAdmin: boolean;
    isOwner: boolean;
    permissions: {
      canManageCampaign: boolean;
      canManageCampaignCharacters: boolean;
      canUsePlayerCampaignTools: boolean;
    };
  };
  characters: CampaignCharacterRow[];
  playerMembers: PlayerMemberRow[];
  bondsMode: string;
  error?: string;
};

type CharacterDraft = {
  name: string;
  assignedUserId: string;
};

function makeDraft(character: CampaignCharacterRow): CharacterDraft {
  return {
    name: character.name,
    assignedUserId: character.assignedUserId ?? "",
  };
}

export default function CampaignCharactersPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campaignId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [access, setAccess] = useState<CharactersPayload["access"] | null>(null);
  const [characters, setCharacters] = useState<CampaignCharacterRow[]>([]);
  const [playerMembers, setPlayerMembers] = useState<PlayerMemberRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CharacterDraft>>({});
  const [newCharacterName, setNewCharacterName] = useState("");
  const [newAssignedUserId, setNewAssignedUserId] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);

  const canManageCharacters = Boolean(access?.permissions.canManageCampaignCharacters);

  const assignedCharacterIds = useMemo(() => {
    const currentUserId = access?.userId;
    if (!currentUserId) return new Set<string>();
    return new Set(
      characters
        .filter((character) => character.assignedUserId === currentUserId)
        .map((character) => character.id),
    );
  }, [access?.userId, characters]);

  async function loadCharacters() {
    if (!campaignId) {
      setErr("Missing campaign id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);
    setFormErr(null);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as CharactersPayload;

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        setErr("You do not have access to this campaign.");
        return;
      }
      if (res.status === 404) {
        setErr("Campaign not found.");
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load campaign characters.");
      }

      setCampaign(data.campaign);
      setAccess(data.access);
      setCharacters(data.characters ?? []);
      setPlayerMembers(data.playerMembers ?? []);
      setDrafts(
        Object.fromEntries(
          (data.characters ?? []).map((character) => [character.id, makeDraft(character)]),
        ),
      );
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : "Failed to load campaign characters.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCharacters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function handleCreateCharacter() {
    if (!campaignId) return;
    const name = newCharacterName.trim();
    if (!name) {
      setFormErr("Enter a character name.");
      return;
    }

    setSaving(true);
    setFormErr(null);

    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          assignedUserId: newAssignedUserId || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create character.");
      }

      setNewCharacterName("");
      setNewAssignedUserId("");
      await loadCharacters();
    } catch (error: unknown) {
      setFormErr(error instanceof Error ? error.message : "Failed to create character.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCharacter(characterId: string) {
    if (!campaignId) return;
    const draft = drafts[characterId];
    if (!draft) return;

    const name = draft.name.trim();
    if (!name) {
      setFormErr("Character name is required.");
      return;
    }

    setSaving(true);
    setFormErr(null);

    try {
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            assignedUserId: draft.assignedUserId || null,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update character.");
      }

      await loadCharacters();
    } catch (error: unknown) {
      setFormErr(error instanceof Error ? error.message : "Failed to update character.");
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(characterId: string, patch: Partial<CharacterDraft>) {
    setDrafts((current) => ({
      ...current,
      [characterId]: {
        name: current[characterId]?.name ?? "",
        assignedUserId: current[characterId]?.assignedUserId ?? "",
        ...patch,
      },
    }));
  }

  const campaignName = campaign?.name ?? "Campaign";

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-6">
        <div className="text-zinc-400">Loading campaign characters...</div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-black text-zinc-100 p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-xl font-semibold">Character Management</h1>
          <p className="text-red-400">{err}</p>
          <button
            type="button"
            onClick={() => router.replace("/dashboard")}
            className="rounded-lg bg-zinc-800 px-4 py-2 hover:bg-zinc-700"
          >
            Back to campaigns
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm text-zinc-400">
              Campaign: <span className="text-zinc-200">{campaignName}</span>
            </div>
            <h1 className="text-2xl font-semibold">Character Management</h1>
            <p className="text-sm text-zinc-400">
              Game Directors create campaign characters and assign them to Player members.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/campaign/${campaignId}`)}
            className="rounded-lg border border-zinc-800 px-4 py-2 hover:bg-zinc-950"
          >
            Back to campaign
          </button>
        </header>

        {canManageCharacters ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <h2 className="font-semibold">Create Character</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div>
                <label className="block text-xs text-zinc-400" htmlFor="new-character-name">
                  Character name
                </label>
                <input
                  id="new-character-name"
                  type="text"
                  value={newCharacterName}
                  onChange={(event) => setNewCharacterName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                  placeholder="Character name"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400" htmlFor="new-character-player">
                  Assigned Player
                </label>
                <select
                  id="new-character-player"
                  value={newAssignedUserId}
                  onChange={(event) => setNewAssignedUserId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                >
                  <option value="">Unassigned</option>
                  {playerMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.userId}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void handleCreateCharacter()}
                  disabled={saving}
                  className="w-full rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Create"}
                </button>
              </div>
            </div>
            {formErr ? <p className="mt-3 text-sm text-red-400">{formErr}</p> : null}
          </section>
        ) : (
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <h2 className="font-semibold">Your Characters</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Character editing is a future step. Game Directors manage assignments for now.
            </p>
          </section>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">Campaign Characters</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Basic records only. The full Character Builder route is reserved for a later step.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Assigned Player</th>
                  <th className="py-2 pr-3 font-medium">Builder</th>
                  {canManageCharacters ? (
                    <th className="py-2 pr-3 font-medium">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {characters.length === 0 ? (
                  <tr>
                    <td className="py-3 text-zinc-500" colSpan={canManageCharacters ? 4 : 3}>
                      No campaign characters yet.
                    </td>
                  </tr>
                ) : (
                  characters.map((character) => {
                    const draft = drafts[character.id] ?? makeDraft(character);
                    const isAssignedToCurrentUser = assignedCharacterIds.has(character.id);
                    return (
                      <tr
                        key={character.id}
                        className="border-b border-zinc-900 align-top last:border-0"
                      >
                        <td className="py-2 pr-3">
                          {canManageCharacters ? (
                            <input
                              type="text"
                              value={draft.name}
                              onChange={(event) => updateDraft(character.id, { name: event.target.value })}
                              className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                            />
                          ) : (
                            <span className="font-medium">{character.name}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {canManageCharacters ? (
                            <select
                              value={draft.assignedUserId}
                              onChange={(event) => updateDraft(character.id, { assignedUserId: event.target.value })}
                              className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                            >
                              <option value="">Unassigned</option>
                              {playerMembers.map((member) => (
                                <option key={member.userId} value={member.userId}>
                                  {member.userId}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-mono text-xs text-zinc-300">
                              {character.assignedUserId ?? "Unassigned"}
                              {isAssignedToCurrentUser ? " (you)" : ""}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-zinc-400">
                          <div className="text-xs">
                            Reserved route:
                            <span className="ml-1 font-mono text-zinc-300">
                              /campaign/{campaignId}/characters/{character.id}
                            </span>
                          </div>
                        </td>
                        {canManageCharacters ? (
                          <td className="py-2 pr-3">
                            <button
                              type="button"
                              onClick={() => void handleSaveCharacter(character.id)}
                              disabled={saving}
                              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Save
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="font-semibold">Bonds</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Bonds are Game Director-assigned and will live in Character Management in a later step.
          </p>
        </section>
      </div>
    </main>
  );
}
