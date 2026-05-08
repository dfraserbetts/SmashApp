"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { CampaignNav } from "@/app/components/CampaignNav";

type ItemTemplateSummary = {
  id: string;
  name: string | null;
  rarity: string | null;
  level: number | null;
  type: string | null;
  size: string | null;
  armorLocation: string | null;
  itemLocation: string | null;
};

type CharacterSummary = {
  id: string;
  name: string;
  assignedUserId: string | null;
  archivedAt: string | null;
};

type BackpackAssignment = {
  id: string;
  campaignId: string;
  characterId: string;
  partyInventoryItemId: string;
  quantity: number;
  character: CharacterSummary;
};

type PartyInventoryItem = {
  id: string;
  campaignId: string;
  itemTemplateId: string;
  quantity: number;
  assignedQuantity: number;
  availableQuantity: number;
  itemTemplate: ItemTemplateSummary;
  backpackItems: BackpackAssignment[];
};

type InventoryPayload = {
  campaign: {
    id: string;
    name: string;
  };
  access: {
    userId: string;
    role: string | null;
    permissions: {
      canManageCampaignInventory: boolean;
    };
  };
  itemTemplates: ItemTemplateSummary[];
  partyItems: PartyInventoryItem[];
  characters: CharacterSummary[];
};

type AssignmentDraft = {
  characterId: string;
  quantity: string;
};

function formatItemDetails(item: ItemTemplateSummary) {
  const parts = [
    item.type,
    item.rarity,
    item.level !== null && item.level !== undefined ? `Level ${item.level}` : null,
    item.size ?? item.armorLocation ?? item.itemLocation,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : "No item details";
}

function getCharacterDisplayName(character: CharacterSummary) {
  const name = character.name?.trim();
  return name ? name : "UNNAMED";
}

function getCharacterLabel(character: CharacterSummary) {
  const displayName = getCharacterDisplayName(character);
  const shortId = character.id.slice(0, 8);
  const archived = character.archivedAt ? " - Archived" : "";
  return `${displayName} (${shortId})${archived}`;
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

export default function CampaignInventoryPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const campaignId =
    typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const [payload, setPayload] = useState<InventoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [addQuantity, setAddQuantity] = useState("1");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [backpackQuantityDrafts, setBackpackQuantityDrafts] = useState<Record<string, string>>({});

  const canManageInventory = Boolean(
    payload?.access.permissions.canManageCampaignInventory,
  );

  const activeCharacters = useMemo(
    () => payload?.characters.filter((character) => !character.archivedAt) ?? [],
    [payload],
  );

  const assignmentTargets = payload?.characters ?? [];

  const loadInventory = useCallback(async () => {
    if (!campaignId) {
      setError("Missing campaign id.");
      setPayload(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/party-inventory`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      if (!res.ok) {
        throw new Error(await readApiError(res, `Failed to load inventory (${res.status})`));
      }

      const json = (await res.json()) as InventoryPayload;
      setPayload(json);
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    if (!payload) return;

    const nextQuantityDrafts: Record<string, string> = {};
    const nextAssignmentDrafts: Record<string, AssignmentDraft> = {};
    const nextBackpackQuantityDrafts: Record<string, string> = {};
    const defaultCharacterId = activeCharacters[0]?.id ?? payload.characters[0]?.id ?? "";

    for (const item of payload.partyItems) {
      nextQuantityDrafts[item.id] = String(item.quantity);
      nextAssignmentDrafts[item.id] = {
        characterId: defaultCharacterId,
        quantity: "1",
      };
      for (const assignment of item.backpackItems) {
        nextBackpackQuantityDrafts[assignment.id] = String(assignment.quantity);
      }
    }

    setQuantityDrafts(nextQuantityDrafts);
    setAssignmentDrafts(nextAssignmentDrafts);
    setBackpackQuantityDrafts(nextBackpackQuantityDrafts);
  }, [activeCharacters, payload]);

  async function runAction(key: string, action: () => Promise<void>, successMessage: string) {
    setBusyKey(key);
    setActionError(null);
    setActionMessage(null);
    try {
      await action();
      setActionMessage(successMessage);
      await loadInventory();
    } catch (actionErrorValue) {
      setActionError(
        actionErrorValue instanceof Error
          ? actionErrorValue.message
          : "Inventory action failed.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAddPartyItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTemplateId) {
      setActionError("Choose an item to add to Party Inventory.");
      return;
    }

    await runAction(
      "add-party-item",
      async () => {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/party-inventory`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              itemTemplateId: selectedTemplateId,
              quantity: Number(addQuantity),
            }),
          },
        );
        if (!res.ok) {
          throw new Error(await readApiError(res, "Failed to add item to Party Inventory."));
        }
        setAddQuantity("1");
      },
      "Added to Party Inventory.",
    );
  }

  async function handleUpdatePartyQuantity(item: PartyInventoryItem) {
    await runAction(
      `party-quantity-${item.id}`,
      async () => {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/party-inventory/${encodeURIComponent(
            item.id,
          )}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ quantity: Number(quantityDrafts[item.id]) }),
          },
        );
        if (!res.ok) {
          throw new Error(await readApiError(res, "Failed to update Party Inventory quantity."));
        }
      },
      "Party Inventory quantity updated.",
    );
  }

  async function handleRemovePartyItem(item: PartyInventoryItem) {
    if (item.assignedQuantity > 0) {
      setActionError("Remove backpack assignments before removing this Party Inventory item.");
      return;
    }
    const confirmed = window.confirm(
      "Remove this item from Party Inventory? The Forge item template will remain in the campaign library.",
    );
    if (!confirmed) return;

    await runAction(
      `remove-party-${item.id}`,
      async () => {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/party-inventory/${encodeURIComponent(
            item.id,
          )}`,
          {
            method: "DELETE",
            credentials: "include",
          },
        );
        if (!res.ok) {
          throw new Error(await readApiError(res, "Failed to remove Party Inventory item."));
        }
      },
      "Party Inventory item removed.",
    );
  }

  async function handleAssignToCharacter(item: PartyInventoryItem) {
    const draft = assignmentDrafts[item.id];
    if (!draft?.characterId) {
      setActionError("Choose a character to receive this item.");
      return;
    }

    await runAction(
      `assign-${item.id}`,
      async () => {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(
            draft.characterId,
          )}/backpack`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              partyInventoryItemId: item.id,
              quantity: Number(draft.quantity),
            }),
          },
        );
        if (!res.ok) {
          throw new Error(await readApiError(res, "Failed to assign item to Backpack."));
        }
      },
      "Item assigned to Backpack.",
    );
  }

  async function handleUpdateBackpackAssignment(assignment: BackpackAssignment) {
    await runAction(
      `backpack-quantity-${assignment.id}`,
      async () => {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(
            assignment.characterId,
          )}/backpack/${encodeURIComponent(assignment.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ quantity: Number(backpackQuantityDrafts[assignment.id]) }),
          },
        );
        if (!res.ok) {
          throw new Error(await readApiError(res, "Failed to update Backpack quantity."));
        }
      },
      "Backpack quantity updated.",
    );
  }

  async function handleRemoveBackpackAssignment(assignment: BackpackAssignment) {
    await runAction(
      `remove-backpack-${assignment.id}`,
      async () => {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(
            assignment.characterId,
          )}/backpack/${encodeURIComponent(assignment.id)}`,
          {
            method: "DELETE",
            credentials: "include",
          },
        );
        if (!res.ok) {
          throw new Error(await readApiError(res, "Failed to remove Backpack assignment."));
        }
      },
      "Backpack assignment removed.",
    );
  }

  return (
    <main className="min-h-screen w-full bg-black text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <CampaignNav campaignId={campaignId} />

        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Party Inventory</h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-400">
              Add campaign item templates to the party pool, then assign quantities to
              character Backpacks. Forge templates stay in the campaign library.
            </p>
          </div>

          <button
            onClick={() => router.replace(`/campaign/${campaignId}`)}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm hover:bg-zinc-950"
          >
            Back to campaign
          </button>
        </header>

        {loading && <p className="text-sm text-zinc-500">Loading Party Inventory...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {actionError && <p className="text-sm text-red-400">{actionError}</p>}
        {actionMessage && <p className="text-sm text-emerald-400">{actionMessage}</p>}

        {!loading && !error && payload && (
          <>
            {canManageInventory ? (
              <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <h2 className="text-lg font-semibold">Add to Party Inventory</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Choose an existing legal campaign item. Adding the same item again increases
                  its Party Inventory quantity.
                </p>
                <form
                  onSubmit={handleAddPartyItem}
                  className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto]"
                >
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    className="rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="">Choose an item template</option>
                    {payload.itemTemplates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name ?? "(Unnamed item)"} - {formatItemDetails(item)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={addQuantity}
                    onChange={(event) => setAddQuantity(event.target.value)}
                    className="rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-100"
                  />
                  <button
                    type="submit"
                    disabled={busyKey === "add-party-item"}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyKey === "add-party-item" ? "Adding..." : "Add Item"}
                  </button>
                </form>
              </section>
            ) : (
              <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <h2 className="text-lg font-semibold">Your Backpack</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Read-only view. A Game Director manages Party Inventory and Backpack
                  assignments.
                </p>
              </section>
            )}

            {payload.partyItems.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-500">
                {canManageInventory
                  ? "No Party Inventory items yet."
                  : "No Backpack items assigned to your active character yet."}
              </p>
            ) : (
              <section className="overflow-hidden rounded-xl border border-zinc-800">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-zinc-800 bg-zinc-900/70">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-zinc-300">Item</th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-300">Quantity</th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-300">Backpacks</th>
                      {canManageInventory && (
                        <th className="px-4 py-3 text-left font-medium text-zinc-300">Assign</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {payload.partyItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-zinc-800/80 align-top last:border-b-0"
                      >
                        <td className="px-4 py-4">
                          <div className="font-medium text-zinc-100">
                            {item.itemTemplate.name ?? "(Unnamed item)"}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {formatItemDetails(item.itemTemplate)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            {canManageInventory ? (
                              <div className="text-zinc-300">
                                Total {item.quantity} / Assigned {item.assignedQuantity} /
                                Available {item.availableQuantity}
                              </div>
                            ) : (
                              <div className="text-zinc-300">
                                In Backpack {item.assignedQuantity}
                              </div>
                            )}
                            {canManageInventory && (
                              <div className="flex flex-wrap gap-2">
                                <input
                                  type="number"
                                  min={Math.max(1, item.assignedQuantity)}
                                  step={1}
                                  value={quantityDrafts[item.id] ?? String(item.quantity)}
                                  onChange={(event) =>
                                    setQuantityDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                  className="w-24 rounded-md border border-zinc-700 bg-black px-2 py-1 text-sm text-zinc-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdatePartyQuantity(item)}
                                  disabled={busyKey === `party-quantity-${item.id}`}
                                  className="rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePartyItem(item)}
                                  disabled={
                                    item.assignedQuantity > 0 ||
                                    busyKey === `remove-party-${item.id}`
                                  }
                                  className="rounded-md border border-red-900 px-3 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {item.backpackItems.length === 0 ? (
                            <span className="text-zinc-500">No Backpack assignments.</span>
                          ) : (
                            <div className="space-y-3">
                              {item.backpackItems.map((assignment) => (
                                <div
                                  key={assignment.id}
                                  className="rounded-md border border-zinc-800 bg-black/40 p-3"
                                >
                                  <div className="font-medium text-zinc-200">
                                    {getCharacterLabel(assignment.character)}
                                  </div>
                                  {canManageInventory ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={
                                          backpackQuantityDrafts[assignment.id] ??
                                          String(assignment.quantity)
                                        }
                                        onChange={(event) =>
                                          setBackpackQuantityDrafts((prev) => ({
                                            ...prev,
                                            [assignment.id]: event.target.value,
                                          }))
                                        }
                                        className="w-20 rounded-md border border-zinc-700 bg-black px-2 py-1 text-sm text-zinc-100"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateBackpackAssignment(assignment)}
                                        disabled={
                                          busyKey === `backpack-quantity-${assignment.id}`
                                        }
                                        className="rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveBackpackAssignment(assignment)}
                                        disabled={busyKey === `remove-backpack-${assignment.id}`}
                                        className="rounded-md border border-red-900 px-3 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="mt-1 text-zinc-300">
                                      Quantity {assignment.quantity}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        {canManageInventory && (
                          <td className="px-4 py-4">
                            {assignmentTargets.length === 0 ? (
                              <span className="text-zinc-500">No characters available.</span>
                            ) : (
                              <div className="space-y-2">
                                <select
                                  value={assignmentDrafts[item.id]?.characterId ?? ""}
                                  onChange={(event) =>
                                    setAssignmentDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        characterId: event.target.value,
                                        quantity: prev[item.id]?.quantity ?? "1",
                                      },
                                    }))
                                  }
                                  className="w-full rounded-md border border-zinc-700 bg-black px-2 py-1 text-sm text-zinc-100"
                                >
                                  {assignmentTargets.map((character) => (
                                    <option key={character.id} value={character.id}>
                                      {getCharacterLabel(character)}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min={1}
                                  max={Math.max(1, item.availableQuantity)}
                                  step={1}
                                  value={assignmentDrafts[item.id]?.quantity ?? "1"}
                                  onChange={(event) =>
                                    setAssignmentDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        characterId:
                                          prev[item.id]?.characterId ??
                                          assignmentTargets[0]?.id ??
                                          "",
                                        quantity: event.target.value,
                                      },
                                    }))
                                  }
                                  className="w-24 rounded-md border border-zinc-700 bg-black px-2 py-1 text-sm text-zinc-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAssignToCharacter(item)}
                                  disabled={
                                    item.availableQuantity <= 0 || busyKey === `assign-${item.id}`
                                  }
                                  className="rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Assign to Character
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
