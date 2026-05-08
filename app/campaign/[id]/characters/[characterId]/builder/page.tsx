"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { CampaignNav } from "@/app/components/CampaignNav";
import {
  CHARACTER_ATTRIBUTES,
  GREAT_SECRET_TEMPLATES,
  HEROIC_ATTRIBUTE_ARRAY,
  LEGAL_ATTRIBUTE_VALUES,
  MAX_CHARACTERISTIC_UNITS,
  PLAYER_TRAIT_CATALOG,
  characteristicCost,
  characterPoints,
  defaultBuilderData,
  getCanAddAttributeSwapForBudget,
  getCharacteristicUnits,
  getLegalMagnitudeOptionsForBudget,
  normalizeBuilderData,
  renderCharacteristicDescriptor,
  renderGreatSecret,
  resistPointBudget,
  selectedTraitSummary,
  totalCharacteristicCost,
  traitPointBudget,
  validateAttributes,
  validateBuilderData,
  validateCharacteristic,
  validateResistPoints,
  type AttributeMethod,
  type CharacterAttribute,
  type CharacterAttributeValue,
  type CharacterBuilderData,
  type CharacteristicEffectFamily,
  type CharacteristicState,
} from "@/lib/characterBuilder/core";

type CharacterBuilderRecord = {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string | null;
  age: string | null;
  race: string | null;
  description: string | null;
  level: number;
  builderData: CharacterBuilderData;
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
  builderData: CharacterBuilderData;
};

const PLACEHOLDER_SECTIONS = [
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
    builderData: normalizeBuilderData(character.builderData ?? defaultBuilderData()),
  };
}

function normalizeAgeInput(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeWholeNumberInput(value: string) {
  return value.replace(/\D/g, "");
}

function heroicRequiredCounts() {
  return HEROIC_ATTRIBUTE_ARRAY.reduce<Map<number, number>>((counts, value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  }, new Map());
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
  const [attributeSwapDrafts, setAttributeSwapDrafts] = useState<Record<string, string>>({});

  const previewName = displayName(draft?.name ?? payload?.character.name);
  const previewLevel = Number(draft?.level ?? payload?.character.level ?? 1) || 1;
  const previewRace = draft?.race.trim() ?? payload?.character.race ?? "";
  const previewAge = draft?.age.trim() ?? payload?.character.age ?? "";
  const previewDescription =
    draft?.description.trim() ?? payload?.character.description ?? "";
  const builderData = draft?.builderData ?? defaultBuilderData();
  const isArchived = Boolean(payload?.character.archivedAt);
  const canEdit = Boolean(payload?.canEdit);
  const currentLevel = Math.max(1, Number(draft?.level ?? payload?.character.level ?? 1) || 1);
  const characteristicBudget = characterPoints(currentLevel);
  const characteristicSpent = totalCharacteristicCost(builderData.characteristics);
  const resistBudget = resistPointBudget(currentLevel);
  const resistSpent = CHARACTER_ATTRIBUTES.reduce(
    (sum, attribute) => sum + builderData.resistPoints[attribute],
    0,
  );
  const traitSummary = selectedTraitSummary(builderData.selectedTraitKeys, currentLevel);
  const builderValidationErrors = validateBuilderData(builderData, currentLevel);
  const attributeValidationErrors = validateAttributes(
    builderData.attributeMethod,
    builderData.attributes,
  );
  const resistValidationErrors = validateResistPoints(currentLevel, builderData.resistPoints);
  const canSave = canEdit && !saving && builderValidationErrors.length === 0;

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
      builderData: current?.builderData ?? defaultBuilderData(),
      ...patch,
    }));
  }

  function updateBuilderData(patch: Partial<CharacterBuilderData>) {
    updateDraft({
      builderData: {
        ...builderData,
        ...patch,
      },
    });
  }

  function updateGreatSecretField(index: number, value: string) {
    const fields = [...builderData.greatSecret.fields];
    fields[index] = value;
    updateBuilderData({
      greatSecret: {
        ...builderData.greatSecret,
        fields,
      },
    });
  }

  function addCharacteristic() {
    updateBuilderData({
      characteristics: [
        ...builderData.characteristics,
        {
          id: `characteristic-${Date.now()}`,
          name: "",
          keyword: "",
          additionalDice: 1,
          resultModifier: undefined,
          rerollOnes: undefined,
          attributeSwaps: [],
        },
      ],
    });
  }

  function updateCharacteristic(characteristicId: string, patch: Partial<CharacteristicState>) {
    updateBuilderData({
      characteristics: builderData.characteristics.map((characteristic) =>
        characteristic.id === characteristicId
          ? {
              ...characteristic,
              ...patch,
            }
          : characteristic,
      ),
    });
  }

  function removeCharacteristic(characteristicId: string) {
    updateBuilderData({
      characteristics: builderData.characteristics.filter(
        (characteristic) => characteristic.id !== characteristicId,
      ),
    });
    setAttributeSwapDrafts((current) => {
      const next = { ...current };
      delete next[characteristicId];
      return next;
    });
  }

  function addAttributeSwap(characteristic: CharacteristicState) {
    const selected = attributeSwapDrafts[characteristic.id] as CharacterAttribute | undefined;
    if (
      !selected ||
      !CHARACTER_ATTRIBUTES.includes(selected) ||
      characteristic.attributeSwaps.includes(selected) ||
      !getCanAddAttributeSwapForBudget(characteristic, getCharacteristicGlobalBudget(characteristic))
    ) {
      return;
    }
    updateCharacteristic(characteristic.id, {
      attributeSwaps: [...characteristic.attributeSwaps, selected],
    });
    setAttributeSwapDrafts((current) => ({
      ...current,
      [characteristic.id]: "",
    }));
  }

  function removeAttributeSwap(characteristic: CharacteristicState, attribute: CharacterAttribute) {
    updateCharacteristic(characteristic.id, {
      attributeSwaps: characteristic.attributeSwaps.filter((swap) => swap !== attribute),
    });
  }

  function updateAttributeMethod(method: AttributeMethod) {
    updateBuilderData({
      attributeMethod: method,
      attributes: method === "HEROIC" ? { ...builderData.attributes } : builderData.attributes,
    });
  }

  function updateAttribute(attribute: CharacterAttribute, value: CharacterAttributeValue) {
    updateBuilderData({
      attributes: {
        ...builderData.attributes,
        [attribute]: value,
      },
    });
  }

  function getCharacteristicGlobalBudget(characteristic: CharacteristicState) {
    const currentCost = characteristicCost(characteristic);
    return Math.max(0, characteristicBudget - (characteristicSpent - currentCost));
  }

  function updateResistPoint(attribute: CharacterAttribute, value: string) {
    const digits = normalizeWholeNumberInput(value);
    const requested = Number.parseInt(digits || "0", 10) || 0;
    const current = builderData.resistPoints[attribute] ?? 0;
    const remainingWithoutCurrent = Math.max(0, resistBudget - (resistSpent - current));
    const numeric = Math.min(requested, remainingWithoutCurrent);
    updateBuilderData({
      resistPoints: {
        ...builderData.resistPoints,
        [attribute]: numeric,
      },
    });
  }

  function isHeroicValueAvailable(attribute: CharacterAttribute, value: number) {
    if (builderData.attributeMethod !== "HEROIC") return true;
    const required = heroicRequiredCounts();
    const used = CHARACTER_ATTRIBUTES.reduce<Map<number, number>>((counts, candidate) => {
      if (candidate === attribute) return counts;
      const candidateValue = builderData.attributes[candidate];
      if (candidateValue === "") return counts;
      counts.set(candidateValue, (counts.get(candidateValue) ?? 0) + 1);
      return counts;
    }, new Map());
    return (used.get(value) ?? 0) < (required.get(value) ?? 0);
  }

  function toggleTrait(traitKey: string) {
    const selected = new Set(builderData.selectedTraitKeys);
    if (selected.has(traitKey)) {
      selected.delete(traitKey);
    } else {
      selected.add(traitKey);
    }
    updateBuilderData({ selectedTraitKeys: Array.from(selected) });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!builderApiUrl || !draft || !canEdit) return;
    if (builderValidationErrors.length > 0) {
      setError("Resolve blocking Character Builder validation errors before saving.");
      return;
    }

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
          builderData: draft.builderData,
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
      <div className="sticky top-3 z-20 rounded-xl border border-zinc-800 bg-black/95 p-3 shadow-lg shadow-black/30 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-200">Character Builder</div>
            <div className="text-xs text-zinc-500">
              Save applies Character Details, Narrative Details, Characteristics,
              Attributes, Resist Points, and Traits.
            </div>
          </div>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Character"}
          </button>
        </div>
        {builderValidationErrors.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
            {builderValidationErrors.map((validationError) => (
              <li key={validationError}>{validationError}</li>
            ))}
          </ul>
        ) : null}
        {!canEdit ? (
          <span className="mt-2 block text-sm text-zinc-500">
            This character is not editable from your account.
          </span>
        ) : null}
      </div>

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

      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <h2 className="text-lg font-semibold">Narrative Details</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Great Secret and narrative notes. Bonds remain Game Director-assigned later.
        </p>
        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="text-xs text-zinc-400">Great Secret Template</span>
            <select
              value={builderData.greatSecret.templateKey}
              onChange={(event) => {
                const template = GREAT_SECRET_TEMPLATES.find(
                  (candidate) => candidate.key === event.target.value,
                ) ?? GREAT_SECRET_TEMPLATES[0];
                updateBuilderData({
                  greatSecret: {
                    templateKey: template.key,
                    fields: template.fieldLabels.map(
                      (_, index) => builderData.greatSecret.fields[index] ?? "",
                    ),
                  },
                });
              }}
              disabled={!canEdit || saving}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            >
              {GREAT_SECRET_TEMPLATES.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          {(
            GREAT_SECRET_TEMPLATES.find(
              (template) => template.key === builderData.greatSecret.templateKey,
            ) ?? GREAT_SECRET_TEMPLATES[0]
          ).fieldLabels.map((label, index) => (
            <label key={label} className="block">
              <span className="text-xs text-zinc-400">{label}</span>
              <input
                type="text"
                value={builderData.greatSecret.fields[index] ?? ""}
                onChange={(event) => updateGreatSecretField(index, event.target.value)}
                disabled={!canEdit || saving}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              />
            </label>
          ))}
          <div className="rounded-lg border border-zinc-800 bg-black p-3 text-sm text-zinc-300">
            {renderGreatSecret(builderData.greatSecret)}
          </div>
          <label className="block">
            <span className="text-xs text-zinc-400">Narrative Notes</span>
            <textarea
              value={builderData.narrativeNotes}
              onChange={(event) => updateBuilderData({ narrativeNotes: event.target.value })}
              disabled={!canEdit || saving}
              rows={4}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
            />
          </label>
          <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
            Bonds are assigned by the Game Director in a later Character Management step.
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Characteristics</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Character Points: {characteristicSpent}/{characteristicBudget} spent.
            </p>
          </div>
          <button
            type="button"
            onClick={addCharacteristic}
            disabled={!canEdit || saving || characteristicSpent >= characteristicBudget}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add Characteristic
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {builderData.characteristics.length === 0 ? (
            <p className="text-sm text-zinc-500">No Characteristics yet.</p>
          ) : null}
          {builderData.characteristics.map((characteristic) => {
            const cost = characteristicCost(characteristic);
            const units = getCharacteristicUnits(characteristic);
            const characteristicErrors = validateCharacteristic(characteristic);
            const characteristicGlobalBudget = getCharacteristicGlobalBudget(characteristic);
            const canAddSwap = getCanAddAttributeSwapForBudget(
              characteristic,
              characteristicGlobalBudget,
            );
            return (
              <div key={characteristic.id} className="rounded-lg border border-zinc-800 bg-black p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs text-zinc-400">Name</span>
                    <input
                      type="text"
                      value={characteristic.name}
                      onChange={(event) =>
                        updateCharacteristic(characteristic.id, { name: event.target.value })
                      }
                      disabled={!canEdit || saving}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Keyword</span>
                    <input
                      type="text"
                      value={characteristic.keyword}
                      onChange={(event) =>
                        updateCharacteristic(characteristic.id, { keyword: event.target.value })
                      }
                      disabled={!canEdit || saving}
                      placeholder="e.g. Gambling"
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                    />
                  </label>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  {[
                    ["additionalDice", "Additional Dice"],
                    ["resultModifier", "Result Modifier"],
                    ["rerollOnes", "Reroll Ones"],
                  ].map(([field, label]) => {
                    const family = field as CharacteristicEffectFamily;
                    const options = getLegalMagnitudeOptionsForBudget(
                      characteristic,
                      family,
                      characteristicGlobalBudget,
                    );
                    return (
                      <label key={field} className="block">
                        <span className="text-xs text-zinc-400">{label}</span>
                        <select
                          value={String(characteristic[family] ?? "")}
                          onChange={(event) =>
                            updateCharacteristic(characteristic.id, {
                              [field]: event.target.value ? Number(event.target.value) : undefined,
                            } as Partial<CharacteristicState>)
                          }
                          disabled={!canEdit || saving}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                        >
                          <option value="">None</option>
                          {options.map((value) => (
                            <option key={value} value={value}>
                              +{value}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                  <div>
                    <span className="text-xs text-zinc-400">Attribute Swap</span>
                    <div className="mt-1 flex gap-2">
                      <select
                        value={attributeSwapDrafts[characteristic.id] ?? ""}
                        onChange={(event) =>
                          setAttributeSwapDrafts((current) => ({
                            ...current,
                            [characteristic.id]: event.target.value,
                          }))
                        }
                        disabled={!canEdit || saving || !canAddSwap}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                      >
                        <option value="">Add swap...</option>
                        {CHARACTER_ATTRIBUTES.filter(
                          (attribute) => !characteristic.attributeSwaps.includes(attribute),
                        ).map((attribute) => (
                          <option key={attribute} value={attribute}>
                            {attribute}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => addAttributeSwap(characteristic)}
                        disabled={
                          !canEdit ||
                          saving ||
                          !attributeSwapDrafts[characteristic.id] ||
                          !canAddSwap
                        }
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Add
                      </button>
                    </div>
                    {characteristic.attributeSwaps.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {characteristic.attributeSwaps.map((attribute) => (
                          <button
                            key={attribute}
                            type="button"
                            onClick={() => removeAttributeSwap(characteristic, attribute)}
                            disabled={!canEdit || saving}
                            className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {attribute} x
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div
                    className={
                      units > MAX_CHARACTERISTIC_UNITS ||
                      cost > 15 ||
                      cost > characteristicGlobalBudget
                        ? "text-sm text-red-300"
                        : "text-sm text-zinc-400"
                    }
                  >
                    Cost: {cost}/15 ({units}/{MAX_CHARACTERISTIC_UNITS} units),{" "}
                    {characteristicGlobalBudget} points available for this Characteristic
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCharacteristic(characteristic.id)}
                    disabled={!canEdit || saving}
                    className="rounded-lg border border-red-900 px-3 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-3 text-sm text-zinc-300">
                  {renderCharacteristicDescriptor(characteristic)}
                </p>
                {characteristicErrors.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
                    {characteristicErrors.map((validationError) => (
                      <li key={validationError}>{validationError}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
          {characteristicSpent > characteristicBudget ? (
            <p className="text-sm text-red-300">
              Total Characteristic cost exceeds available Character Points.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <h2 className="text-lg font-semibold">Attributes / Resist Points</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-black p-3">
            <label className="block">
              <span className="text-xs text-zinc-400">Attribute Generation Method</span>
              <select
                value={builderData.attributeMethod}
                onChange={(event) => updateAttributeMethod(event.target.value as AttributeMethod)}
                disabled={!canEdit || saving}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
              >
                <option value="HEROIC">Heroic</option>
                <option value="DESTINY">Destiny</option>
                <option value="ROLLED">Rolled</option>
              </select>
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              Heroic uses 12, 10, 8, 8, 6, 4. Destiny must total 48. Rolled allows legal table values.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {CHARACTER_ATTRIBUTES.map((attribute) => (
                <label key={attribute} className="block">
                  <span className="text-xs text-zinc-400">{attribute}</span>
                  <select
                    value={builderData.attributes[attribute]}
                    onChange={(event) =>
                      updateAttribute(
                        attribute,
                        event.target.value ? Number(event.target.value) : "",
                      )
                    }
                    disabled={!canEdit || saving}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                  >
                    <option value="">Choose value...</option>
                    {LEGAL_ATTRIBUTE_VALUES.map((value) => (
                      <option
                        key={value}
                        value={value}
                        disabled={!isHeroicValueAvailable(attribute, value)}
                      >
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-3 text-sm text-zinc-400">
              Attribute total:{" "}
              {CHARACTER_ATTRIBUTES.reduce(
                (sum, attribute) =>
                  sum +
                  (typeof builderData.attributes[attribute] === "number"
                    ? builderData.attributes[attribute]
                    : 0),
                0,
              )}
              {builderData.attributeMethod === "DESTINY" ? " / 48" : ""}
            </div>
            {builderData.attributeMethod === "DESTINY" ? (
              <div className="mt-1 text-sm text-zinc-500">
                Remaining to 48:{" "}
                {48 -
                  CHARACTER_ATTRIBUTES.reduce(
                    (sum, attribute) =>
                      sum +
                      (typeof builderData.attributes[attribute] === "number"
                        ? builderData.attributes[attribute]
                        : 0),
                    0,
                  )}
              </div>
            ) : null}
            {attributeValidationErrors.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
                {attributeValidationErrors.map((validationError) => (
                  <li key={validationError}>{validationError}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-black p-3">
            <h3 className="font-semibold">Resist Points</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Budget: {resistSpent}/{resistBudget}. Add assigned points as dice to Resist rolls.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {CHARACTER_ATTRIBUTES.map((attribute) => (
                <label key={attribute} className="block">
                  <span className="text-xs text-zinc-400">{attribute}</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(
                      0,
                      resistBudget -
                        (resistSpent - (builderData.resistPoints[attribute] ?? 0)),
                    )}
                    step={1}
                    value={builderData.resistPoints[attribute]}
                    onKeyDown={(event) => {
                      if (["e", "E", "+", "-", "."].includes(event.key)) {
                        event.preventDefault();
                      }
                    }}
                    onBeforeInput={(event) => {
                      if (event.data && /\D/.test(event.data)) {
                        event.preventDefault();
                      }
                    }}
                    onPaste={(event) => {
                      const text = event.clipboardData.getData("text");
                      if (/\D/.test(text)) {
                        event.preventDefault();
                        updateResistPoint(attribute, normalizeWholeNumberInput(text));
                      }
                    }}
                    onChange={(event) => updateResistPoint(attribute, event.target.value)}
                    disabled={!canEdit || saving}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-60"
                  />
                </label>
              ))}
            </div>
            {resistValidationErrors.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">
                {resistValidationErrors.map((validationError) => (
                  <li key={validationError}>{validationError}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <h2 className="text-lg font-semibold">Player Traits</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Trait Points: {traitSummary.positiveCost}/{traitSummary.available} spent
          ({traitPointBudget(currentLevel)} base + {traitSummary.negativeBonusAllowed} allowed negative bonus).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PLAYER_TRAIT_CATALOG.map((trait) => {
            const selected = builderData.selectedTraitKeys.includes(trait.key);
            return (
              <label
                key={trait.key}
                className="flex gap-3 rounded-lg border border-zinc-800 bg-black p-3"
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleTrait(trait.key)}
                  disabled={!canEdit || saving}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-medium text-zinc-200">
                    {trait.name} ({trait.classification === "POSITIVE" ? `-${trait.pointValue}` : `+${trait.pointValue}`})
                  </span>
                  <span className="mt-1 block text-sm text-zinc-500">{trait.descriptor}</span>
                </span>
              </label>
            );
          })}
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
    <aside className="max-h-none space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
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

      <div className="rounded-lg border border-zinc-800 bg-black p-3">
        <div className="text-xs text-zinc-500">Great Secret</div>
        <p className="mt-1 text-sm text-zinc-200">{renderGreatSecret(builderData.greatSecret)}</p>
      </div>

      {builderData.narrativeNotes ? (
        <div className="rounded-lg border border-zinc-800 bg-black p-3">
          <div className="text-xs text-zinc-500">Narrative Notes</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
            {builderData.narrativeNotes}
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-zinc-800 bg-black p-3">
        <div className="text-xs text-zinc-500">Characteristics</div>
        {builderData.characteristics.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No Characteristics yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-zinc-200">
            {builderData.characteristics.map((characteristic) => (
              <li key={characteristic.id}>{renderCharacteristicDescriptor(characteristic)}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-black p-3">
        <div className="text-xs text-zinc-500">Attributes</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-zinc-200">
          {CHARACTER_ATTRIBUTES.map((attribute) => (
            <div key={attribute} className="flex justify-between gap-3">
              <span>{attribute}</span>
              <span>{builderData.attributes[attribute] || "Unassigned"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-black p-3">
        <div className="text-xs text-zinc-500">Resist Points</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-zinc-200">
          {CHARACTER_ATTRIBUTES.map((attribute) => (
            <div key={attribute} className="flex justify-between gap-3">
              <span>{attribute}</span>
              <span>+{builderData.resistPoints[attribute]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-black p-3">
        <div className="text-xs text-zinc-500">Player Traits</div>
        {traitSummary.selected.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No Traits selected.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-zinc-200">
            {traitSummary.selected.map((trait) => (
              <li key={trait.key}>
                <span className="font-medium">{trait.name}:</span> {trait.descriptor}
              </li>
            ))}
          </ul>
        )}
      </div>

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
              Step 6 core sections: character identity, narrative details,
              Characteristics, Attributes, Resist Points, and player Traits.
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
          <div
            className={
              mobileView === "editor"
                ? "hidden lg:sticky lg:top-4 lg:block lg:self-start"
                : "block lg:sticky lg:top-4 lg:self-start"
            }
          >
            {previewPanel}
          </div>
        </div>
      </div>
    </main>
  );
}
