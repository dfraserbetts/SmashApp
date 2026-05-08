"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { CampaignNav } from "@/app/components/CampaignNav";

type CharacterBuilderRecord = {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string | null;
  age: string | null;
  race: string | null;
  description: string | null;
  level: number;
  assignedUserId: string | null;
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type BuilderPayload = {
  campaign: {
    id: string;
    name: string;
  };
  character: CharacterBuilderRecord;
  access: {
    userId: string;
    role: string | null;
    permissions: {
      canManageCampaignCharacters: boolean;
    };
  };
  canEdit: boolean;
  assignedPlayerLabel: string;
  error?: string;
};

type BuilderDraft = {
  name: string;
  imageUrl: string;
  age: string;
  race: string;
  description: string;
  level: string;
};

const PLACEHOLDER_SECTIONS = [
  {
    title: "Narrative Details",
    status: "Coming in Step 6",
  },
  {
    title: "Characteristics",
    status: "Coming in Step 6",
  },
  {
    title: "Attributes / Resist Points",
    status: "Coming in Step 6",
  },
  {
    title: "Traits",
    status: "Coming in Step 6",
  },
  {
    title: "Equipped Gear / Backpack",
    status: "Coming in Step 7 from Backpack ownership",
  },
  {
    title: "Powers",
    status: "Coming in Step 8",
  },
  {
    title: "Printable Preview",
    status: "Coming in Step 9",
  },
];

function displayName(name: string | null | undefined) {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "UNNAMED";
}

function makeDraft(character: CharacterBuilderRecord): BuilderDraft {
  return {
    name: displayName(character.name) === "UNNAMED" ? "" : character.name,
    imageUrl: character.imageUrl ?? "",
    age: character.age ?? "",
    race: character.race ?? "",
    description: character.description ?? "",
    level: String(character.level || 1),
  };
}

function normalizeAgeInput(value: string) {
  return value.replace(/\D/g, "");
}

async function readApiError(res: Response, fallback: string) {
  try {
    const payload = (await res.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {}
  return fallback;
}

export default function CharacterBuilderPage() {
  const router = useRouter();
  const params = useParams<{ id: string; characterId: string }>();
  const campaignId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const characterId = Array.isArray(params?.characterId)
    ? params.characterId[0]
    : params?.characterId ?? "";

  const [payload, setPayload] = useState<BuilderPayload | null>(null);
  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");

  const previewName = displayName(draft?.name ?? payload?.character.name);
  const previewLevel = Number(draft?.level ?? payload?.character.level ?? 1) || 1;
  const previewRace = draft?.race.trim() ?? payload?.character.race ?? "";
  const previewAge = draft?.age.trim() ?? payload?.character.age ?? "";
  const previewDescription =
    draft?.description.trim() ?? payload?.character.description ?? "";
  const isArchived = Boolean(payload?.character.archivedAt);
  const canEdit = Boolean(payload?.canEdit);

  const builderApiUrl = useMemo(() => {
    if (!campaignId || !characterId) return "";
    return `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(
      characterId,
    )}/builder`;
  }, [campaignId, characterId]);

  async function loadBuilder() {
    if (!builderApiUrl) {
      setError("Missing campaign or character id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(builderApiUrl, {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as BuilderPayload;

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        setError("You do not have access to this character builder.");
        return;
      }
      if (res.status === 404) {
        setError("Character not found.");
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load character builder.");
      }

      setPayload(data);
      setDraft(makeDraft(data.character));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load builder.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBuilder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderApiUrl]);

  function updateDraft(patch: Partial<BuilderDraft>) {
    setDraft((current) => ({
      name: current?.name ?? "",
      imageUrl: current?.imageUrl ?? "",
      age: current?.age ?? "",
      race: current?.race ?? "",
      description: current?.description ?? "",
      level: current?.level ?? "1",
      ...patch,
    }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!builderApiUrl || !draft || !canEdit) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(builderApiUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: draft.name,
          imageUrl: draft.imageUrl,
          age: draft.age,
          race: draft.race,
          description: draft.description,
          level: Number(draft.level),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        character?: CharacterBuilderRecord;
        error?: string;
      };
      if (!res.ok || !data.character) {
        throw new Error(data.error ?? (await readApiError(res, "Failed to save character.")));
      }

      const savedCharacter = data.character;
      setPayload((current) =>
        current
          ? {
              ...current,
              character: savedCharacter,
            }
          : current,
      );
      setDraft(makeDraft(savedCharacter));
      setMessage("Character details saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save character.");
    } finally {
      setSaving(false);
    }
  }

  const editorPanel = (
    <form onSubmit={handleSave} className="space-y-4">
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div>
          <h2 className="text-lg font-semibold">Character Details</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Basic identity only. Character mechanics arrive in later steps.
          </p>
        </div>

        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="text-xs text-zinc-400">Character Name</span>
            <input
              type="text"
              value={draft?.name ?? ""}
              onChange={(event) => updateDraft({ name: event.target.value })}
              disabled={!canEdit || saving}
              placeholder="UNNAMED"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="text-xs text-zinc-400">Portrait URL</span>
            <input
              type="url"
              value={draft?.imageUrl ?? ""}
              onChange={(event) => updateDraft({ imageUrl: event.target.value })}
              disabled={!canEdit || saving}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-zinc-400">Level</span>
              <input
                type="number"
                min={1}
                step={1}
                value={draft?.level ?? "1"}
                onChange={(event) => updateDraft({ level: event.target.value })}
                disabled={!canEdit || saving}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-400">Age</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft?.age ?? ""}
                onBeforeInput={(event) => {
                  if (event.data && /\D/.test(event.data)) {
                    event.preventDefault();
                  }
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (/\D/.test(text)) {
                    event.preventDefault();
                    updateDraft({ age: normalizeAgeInput(text) });
                  }
                }}
                onChange={(event) => updateDraft({ age: normalizeAgeInput(event.target.value) })}
                disabled={!canEdit || saving}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-400">Race</span>
              <input
                type="text"
                value={draft?.race ?? ""}
                onChange={(event) => updateDraft({ race: event.target.value })}
                disabled={!canEdit || saving}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-zinc-400">Description / Backstory</span>
            <textarea
              value={draft?.description ?? ""}
              onChange={(event) => updateDraft({ description: event.target.value })}
              disabled={!canEdit || saving}
              rows={6}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canEdit || saving}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Character Details"}
          </button>
          {!canEdit ? (
            <span className="text-sm text-zinc-500">
              This character is not editable from your account.
            </span>
          ) : null}
        </div>
      </section>

      {PLACEHOLDER_SECTIONS.map((section) => (
        <section
          key={section.title}
          className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
        >
          <h2 className="font-semibold">{section.title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{section.status}</p>
        </section>
      ))}
    </form>
  );

  const previewPanel = (
    <aside className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Live Preview Shell
        </div>
        <h2 className="mt-1 text-2xl font-semibold">{previewName}</h2>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-300">
          <span className="rounded border border-zinc-800 px-2 py-1">Level {previewLevel}</span>
          {previewRace ? (
            <span className="rounded border border-zinc-800 px-2 py-1">{previewRace}</span>
          ) : null}
          {previewAge ? (
            <span className="rounded border border-zinc-800 px-2 py-1">Age {previewAge}</span>
          ) : null}
          {isArchived ? (
            <span className="rounded border border-amber-800 px-2 py-1 text-amber-300">
              Archived
            </span>
          ) : null}
        </div>
      </div>

      {draft?.imageUrl.trim() ? (
        <div className="rounded-lg border border-zinc-800 bg-black p-3 text-xs text-zinc-400">
          Portrait URL: <span className="break-all text-zinc-200">{draft.imageUrl.trim()}</span>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-black p-6 text-center text-sm text-zinc-500">
          Portrait placeholder
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-black p-3">
        <div className="text-xs text-zinc-500">Campaign</div>
        <div className="text-sm text-zinc-200">{payload?.campaign.name ?? campaignId}</div>
        <div className="mt-2 text-xs text-zinc-500">Assigned Player</div>
        <div className="text-sm text-zinc-200">
          {payload?.assignedPlayerLabel || "Unassigned"}
        </div>
      </div>

      {previewDescription ? (
        <div className="rounded-lg border border-zinc-800 bg-black p-3">
          <div className="text-xs text-zinc-500">Description / Backstory</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
            {previewDescription}
          </p>
        </div>
      ) : null}

      {["Main Sheet", "Character Sheet", "Power Sheet(s)", "Inventory Sheet"].map((label) => (
        <div key={label} className="rounded-lg border border-dashed border-zinc-800 p-4">
          <h3 className="font-medium text-zinc-300">{label}</h3>
          <p className="mt-1 text-sm text-zinc-500">Preview structure reserved for Step 9.</p>
        </div>
      ))}
    </aside>
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-6 text-zinc-100">
        <div className="mx-auto max-w-6xl text-zinc-400">Loading character builder...</div>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main className="min-h-screen bg-black p-6 text-zinc-100">
        <div className="mx-auto max-w-3xl space-y-4">
          <CampaignNav campaignId={campaignId} />
          <h1 className="text-xl font-semibold">Character Builder</h1>
          <p className="text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => router.replace(`/campaign/${campaignId}/characters`)}
            className="rounded-lg border border-zinc-800 px-4 py-2 hover:bg-zinc-950"
          >
            Back to characters
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <CampaignNav campaignId={campaignId} />

        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm text-zinc-400">
              {payload?.campaign.name ?? "Campaign"}
            </div>
            <h1 className="text-2xl font-semibold">Character Builder</h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500">
              Step 5 shell: basic character identity, save/load, and live preview
              structure. Mechanics arrive in later steps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/campaign/${campaignId}/characters`)}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm hover:bg-zinc-950"
          >
            Back to Character Management
          </button>
        </header>

        {isArchived ? (
          <div className="rounded-xl border border-amber-800 bg-amber-950/20 p-4 text-sm text-amber-200">
            This character is archived. Game Directors may inspect or update the shell,
            but assigned Players do not receive active editable access.
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

        <div className="flex gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileView("editor")}
            className={`rounded-lg border px-3 py-2 text-sm ${
              mobileView === "editor"
                ? "border-zinc-500 bg-zinc-900"
                : "border-zinc-800 hover:bg-zinc-950"
            }`}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => setMobileView("preview")}
            className={`rounded-lg border px-3 py-2 text-sm ${
              mobileView === "preview"
                ? "border-zinc-500 bg-zinc-900"
                : "border-zinc-800 hover:bg-zinc-950"
            }`}
          >
            Preview
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className={mobileView === "preview" ? "hidden lg:block" : "block"}>
            {editorPanel}
          </div>
          <div className={mobileView === "editor" ? "hidden lg:block" : "block"}>
            {previewPanel}
          </div>
        </div>
      </div>
    </main>
  );
}
