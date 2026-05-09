"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";

import { CampaignNav } from "@/app/components/CampaignNav";
import type { ItemRarity, ItemType } from "@/lib/forge/types";

type ItemTemplateSummary = {
  id: string;
  name: string | null;
  rarity: string | null;
  level: number | null;
  type: string | null;
  size: string | null;
  armorLocation: string | null;
  itemLocation: string | null;
  tags: string[];
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
      canManagePartyStash: boolean;
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

const PICKER_LEVEL_OPTIONS = Array.from({ length: 20 }, (_, idx) => idx + 1);
const ITEM_TYPES: ItemType[] = [
  "WEAPON",
  "ARMOR",
  "SHIELD",
  "ITEM",
  "CONSUMABLE",
];
const PICKER_ITEM_TYPE_LABELS: Record<ItemType, string> = {
  WEAPON: "Weapon",
  ARMOR: "Armor",
  SHIELD: "Shield",
  ITEM: "Item",
  CONSUMABLE: "Consumable",
};
const PICKER_ITEM_TYPE_OPTIONS = ITEM_TYPES.map((value) => ({
  value,
  label: PICKER_ITEM_TYPE_LABELS[value],
}));
const ITEM_RARITIES: ItemRarity[] = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "LEGENDARY",
  "MYTHIC",
];
const ITEM_RARITY_LABELS: Record<ItemRarity, string> = {
  COMMON: "Common",
  UNCOMMON: "Uncommon",
  RARE: "Rare",
  LEGENDARY: "Legendary",
  MYTHIC: "Mythic",
};

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function formatNumberRanges(values: number[]): string {
  if (values.length === 0) return "";
  const sorted = [...values].sort((a, b) => a - b);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (current === end + 1) {
      end = current;
      continue;
    }
    ranges.push({ start, end });
    start = current;
    end = current;
  }
  ranges.push({ start, end });

  return ranges
    .map((range) => (range.start === range.end ? String(range.start) : `${range.start}-${range.end}`))
    .join(", ");
}

function itemMatches(row: ItemTemplateSummary, q: string): boolean {
  const query = normalizeSearch(q);
  if (!query) return true;

  const name = String(row.name ?? "").toLowerCase();
  if (name.includes(query)) return true;

  return row.tags.some((tag) => String(tag).toLowerCase().includes(query));
}

function isLegendaryItem(row: ItemTemplateSummary): boolean {
  return String(row.rarity ?? "").trim().toLowerCase() === "legendary";
}

function isMythicItem(row: ItemTemplateSummary): boolean {
  return String(row.rarity ?? "").trim().toLowerCase() === "mythic";
}

function normalizePickerItemType(value: string | null | undefined): ItemType | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (ITEM_TYPES.includes(normalized as ItemType)) {
    return normalized as ItemType;
  }
  return null;
}

function formatItemRarityLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toUpperCase() as ItemRarity;
  return ITEM_RARITY_LABELS[normalized] ?? String(value ?? "").trim();
}

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerFiltersOpen, setPickerFiltersOpen] = useState(false);
  const [pickerLevelSelected, setPickerLevelSelected] = useState<number[]>([]);
  const [pickerItemTypesSelected, setPickerItemTypesSelected] = useState<ItemType[]>([]);
  const [pickerRaritiesSelected, setPickerRaritiesSelected] = useState<ItemRarity[]>([]);
  const [pickerExcludeLegendary, setPickerExcludeLegendary] = useState(false);
  const [pickerExcludeMythic, setPickerExcludeMythic] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerFiltersRef = useRef<HTMLDivElement | null>(null);
  const pickerResultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activePickerResultIndex, setActivePickerResultIndex] = useState(0);
  const [addQuantity, setAddQuantity] = useState("1");
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [backpackQuantityDrafts, setBackpackQuantityDrafts] = useState<Record<string, string>>({});

  const canManageInventory = Boolean(
    payload?.access.permissions.canManageCampaignInventory,
  );
  const canAssignPartyStash = Boolean(payload?.access.permissions.canManagePartyStash);

  const activeCharacters = useMemo(
    () => payload?.characters.filter((character) => !character.archivedAt) ?? [],
    [payload],
  );

  const assignmentTargets = activeCharacters;

  const itemTemplates = useMemo(() => payload?.itemTemplates ?? [], [payload?.itemTemplates]);

  const queryFilteredItemTemplates = useMemo(
    () => itemTemplates.filter((row) => itemMatches(row, pickerQuery)),
    [itemTemplates, pickerQuery],
  );

  const filteredItemTemplates = useMemo(
    () =>
      queryFilteredItemTemplates.filter((row) => {
        if (
          pickerLevelSelected.length > 0 &&
          (typeof row.level !== "number" || !pickerLevelSelected.includes(row.level))
        ) {
          return false;
        }
        if (pickerItemTypesSelected.length > 0) {
          const itemType = normalizePickerItemType(row.type);
          if (!itemType || !pickerItemTypesSelected.includes(itemType)) {
            return false;
          }
        }
        if (pickerRaritiesSelected.length > 0) {
          const itemRarity = String(row.rarity ?? "").trim().toUpperCase() as ItemRarity;
          if (!ITEM_RARITIES.includes(itemRarity) || !pickerRaritiesSelected.includes(itemRarity)) {
            return false;
          }
        }
        if (pickerExcludeLegendary && isLegendaryItem(row)) {
          return false;
        }
        if (pickerExcludeMythic && isMythicItem(row)) {
          return false;
        }
        return true;
      }),
    [
      pickerExcludeLegendary,
      pickerExcludeMythic,
      pickerItemTypesSelected,
      pickerLevelSelected,
      pickerRaritiesSelected,
      queryFilteredItemTemplates,
    ],
  );

  const pickerResultRows = filteredItemTemplates;
  const activePickerFilterPills = useMemo(() => {
    const pills: Array<{ id: "level" | "itemType" | "rarity" | "noLegendary" | "noMythic"; label: string }> = [];
    if (pickerLevelSelected.length > 0) {
      pills.push({
        id: "level",
        label: `Level: ${formatNumberRanges(pickerLevelSelected)}`,
      });
    }
    if (pickerItemTypesSelected.length > 0) {
      pills.push({
        id: "itemType",
        label: `Item Type: ${pickerItemTypesSelected
          .map((itemType) => PICKER_ITEM_TYPE_LABELS[itemType])
          .join(", ")}`,
      });
    }
    if (pickerRaritiesSelected.length > 0) {
      pills.push({
        id: "rarity",
        label: `Rarity: ${pickerRaritiesSelected
          .map((rarity) => formatItemRarityLabel(rarity))
          .join(", ")}`,
      });
    }
    if (pickerExcludeLegendary) {
      pills.push({ id: "noLegendary", label: "No Legendary" });
    }
    if (pickerExcludeMythic) {
      pills.push({ id: "noMythic", label: "No Mythic" });
    }
    return pills;
  }, [
    pickerExcludeLegendary,
    pickerExcludeMythic,
    pickerItemTypesSelected,
    pickerLevelSelected,
    pickerRaritiesSelected,
  ]);

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
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (pickerRef.current && !pickerRef.current.contains(target)) {
        setPickerOpen(false);
      }
      if (pickerFiltersRef.current && !pickerFiltersRef.current.contains(target)) {
        setPickerFiltersOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pickerFiltersOpen) {
        setPickerFiltersOpen(false);
      }
      if (pickerOpen) {
        setPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerFiltersOpen, pickerOpen]);

  useEffect(() => {
    pickerResultRefs.current = pickerResultRefs.current.slice(0, pickerResultRows.length);
    setActivePickerResultIndex((prev) => {
      if (!pickerOpen || pickerResultRows.length === 0) return 0;
      return Math.min(prev, pickerResultRows.length - 1);
    });
  }, [pickerOpen, pickerQuery, pickerResultRows.length]);

  useEffect(() => {
    setSelectedTemplateId("");
    setPickerOpen(false);
    setPickerQuery("");
    setPickerFiltersOpen(false);
    setPickerLevelSelected([]);
    setPickerItemTypesSelected([]);
    setPickerRaritiesSelected([]);
    setPickerExcludeLegendary(false);
    setPickerExcludeMythic(false);
  }, [campaignId]);

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

  function togglePickerLevel(level: number) {
    setPickerLevelSelected((prev) =>
      prev.includes(level)
        ? prev.filter((entry) => entry !== level)
        : [...prev, level].sort((a, b) => a - b),
    );
  }

  function setPickerLevelRange(min: number, max: number) {
    setPickerLevelSelected(
      PICKER_LEVEL_OPTIONS.filter((level) => level >= min && level <= max),
    );
  }

  function togglePickerItemType(itemType: ItemType) {
    setPickerItemTypesSelected((prev) =>
      prev.includes(itemType)
        ? prev.filter((entry) => entry !== itemType)
        : ITEM_TYPES.filter((entry) => entry === itemType || prev.includes(entry)),
    );
  }

  function togglePickerRarity(rarity: ItemRarity) {
    setPickerRaritiesSelected((prev) =>
      prev.includes(rarity)
        ? prev.filter((entry) => entry !== rarity)
        : ITEM_RARITIES.filter((entry) => entry === rarity || prev.includes(entry)),
    );
  }

  function clearPickerFilters() {
    setPickerLevelSelected([]);
    setPickerItemTypesSelected([]);
    setPickerRaritiesSelected([]);
    setPickerExcludeLegendary(false);
    setPickerExcludeMythic(false);
  }

  function removePickerFilterPill(pillId: "level" | "itemType" | "rarity" | "noLegendary" | "noMythic") {
    if (pillId === "level") {
      setPickerLevelSelected([]);
      return;
    }
    if (pillId === "itemType") {
      setPickerItemTypesSelected([]);
      return;
    }
    if (pillId === "rarity") {
      setPickerRaritiesSelected([]);
      return;
    }
    if (pillId === "noLegendary") {
      setPickerExcludeLegendary(false);
      return;
    }
    if (pillId === "noMythic") {
      setPickerExcludeMythic(false);
    }
  }

  function selectPickerResult(row: ItemTemplateSummary) {
    setActionError(null);
    setActionMessage(null);
    setSelectedTemplateId(row.id);
    setPickerQuery(row.name ?? "(Unnamed item)");
    setPickerOpen(false);
  }

  function clearSelectedPickerResult() {
    if (!selectedTemplateId) return;
    setSelectedTemplateId("");
    setPickerQuery("");
    setActivePickerResultIndex(0);
    setPickerOpen(true);
  }

  function focusPickerResult(index: number) {
    if (pickerResultRows.length === 0) return;
    const nextIndex = Math.max(0, Math.min(index, pickerResultRows.length - 1));
    setActivePickerResultIndex(nextIndex);
    window.requestAnimationFrame(() => {
      pickerResultRefs.current[nextIndex]?.focus();
    });
  }

  function handlePickerSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (pickerResultRows.length === 0) return;
      event.preventDefault();
      setPickerOpen(true);
      focusPickerResult(0);
      return;
    }
    if (event.key === "Tab" && pickerOpen && !event.shiftKey && pickerResultRows.length > 0) {
      event.preventDefault();
      focusPickerResult(activePickerResultIndex);
    }
  }

  function handlePickerResultKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
    row: ItemTemplateSummary,
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusPickerResult(index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusPickerResult(index - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectPickerResult(row);
    }
  }

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
            <h1 className="text-2xl font-semibold">
              {canManageInventory ? "Party Inventory" : "Party Stash"}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-400">
              {canManageInventory
                ? "Add campaign item templates to the party pool, then assign quantities to character Backpacks. Forge templates stay in the campaign library."
                : "These items are held by the party but are not currently assigned to a character. Ask your Game Director if you want to claim one."}
            </p>
          </div>

          <button
            onClick={() => router.replace(`/campaign/${campaignId}`)}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm hover:bg-zinc-950"
          >
            Back to campaign
          </button>
        </header>

        {loading && (
          <p className="text-sm text-zinc-500">
            Loading {canManageInventory ? "Party Inventory" : "Party Stash"}...
          </p>
        )}
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
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div ref={pickerRef} className="relative min-w-0 flex-1">
                        <div className="relative h-10 flex items-center">
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                          >
                            <path
                              d="M10.5 3a7.5 7.5 0 1 0 4.73 13.32l4.22 4.21 1.06-1.06-4.21-4.22A7.5 7.5 0 0 0 10.5 3Zm0 1.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"
                              fill="currentColor"
                            />
                          </svg>
                          <input
                            value={pickerQuery}
                            onFocus={() => {
                              if (!selectedTemplateId) setPickerOpen(true);
                            }}
                            onClick={() => {
                              if (selectedTemplateId) {
                                clearSelectedPickerResult();
                                return;
                              }
                              setPickerOpen(true);
                            }}
                            onKeyDown={handlePickerSearchKeyDown}
                            onChange={(event) => {
                              setPickerQuery(event.target.value);
                              setSelectedTemplateId("");
                              setActivePickerResultIndex(0);
                              setPickerOpen(true);
                            }}
                            placeholder="Click to search campaign items"
                            role="combobox"
                            aria-expanded={pickerOpen}
                            aria-controls="party-inventory-item-picker-results"
                            aria-activedescendant={
                              pickerOpen && pickerResultRows[activePickerResultIndex]
                                ? `party-inventory-item-picker-result-${pickerResultRows[activePickerResultIndex].id}`
                                : undefined
                            }
                            className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 pl-9 text-sm leading-tight text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>

                        {pickerOpen && (
                          <div className="absolute z-30 mt-1 w-full rounded border border-zinc-800 bg-zinc-950/95 p-2 shadow-lg">
                            <div
                              id="party-inventory-item-picker-results"
                              role="listbox"
                              className="max-h-80 space-y-1 overflow-auto"
                            >
                              {pickerResultRows.length === 0 ? (
                                <p className="px-2 py-2 text-sm text-zinc-500">No matches.</p>
                              ) : (
                                pickerResultRows.map((row, idx) => {
                                  const isActive = activePickerResultIndex === idx;
                                  return (
                                    <button
                                      key={row.id}
                                      id={`party-inventory-item-picker-result-${row.id}`}
                                      ref={(node) => {
                                        pickerResultRefs.current[idx] = node;
                                      }}
                                      type="button"
                                      role="option"
                                      aria-selected={isActive || selectedTemplateId === row.id}
                                      onFocus={() => setActivePickerResultIndex(idx)}
                                      onKeyDown={(event) =>
                                        handlePickerResultKeyDown(event, idx, row)
                                      }
                                      onClick={() => selectPickerResult(row)}
                                      className={`w-full rounded border px-2 py-2 text-left focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                                        selectedTemplateId === row.id
                                          ? "border-emerald-500 bg-emerald-950/20"
                                          : isActive
                                            ? "border-emerald-600 bg-zinc-900"
                                            : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900"
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-medium">
                                            {row.name ?? "(Unnamed item)"}
                                          </p>
                                          <p className="text-xs text-zinc-500">
                                            {row.rarity ?? "?"} L{row.level ?? "?"} -{" "}
                                            {row.type ?? "?"}
                                          </p>
                                        </div>
                                      </div>
                                      {row.tags.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          {row.tags.slice(0, 6).map((tag) => (
                                            <span
                                              key={`${row.id}-${tag}`}
                                              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-[2px] text-[10px] text-zinc-300"
                                            >
                                              {tag}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div ref={pickerFiltersRef} className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setPickerFiltersOpen((prev) => !prev)}
                          className={`inline-flex h-10 shrink-0 items-center rounded border px-3 text-sm ${
                            pickerFiltersOpen
                              ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                              : "border-zinc-700 hover:bg-zinc-800"
                          }`}
                        >
                          Filters
                        </button>

                        {pickerFiltersOpen && (
                          <div className="absolute right-0 z-40 mt-1 w-80 max-w-[90vw] space-y-3 rounded border border-zinc-800 bg-zinc-950/95 p-3 shadow-lg">
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-wide text-zinc-500">Item Level</p>
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPickerLevelSelected([])}
                                  className={`rounded border px-2 py-1 text-xs ${
                                    pickerLevelSelected.length === 0
                                      ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                      : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                                  }`}
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPickerLevelRange(1, 5)}
                                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                                >
                                  1-5
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPickerLevelRange(6, 10)}
                                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                                >
                                  6-10
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPickerLevelRange(11, 15)}
                                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                                >
                                  11-15
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPickerLevelRange(16, 20)}
                                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:bg-zinc-800"
                                >
                                  16-20
                                </button>
                              </div>
                              <div className="grid grid-cols-5 gap-1">
                                {PICKER_LEVEL_OPTIONS.map((level) => {
                                  const active = pickerLevelSelected.includes(level);
                                  return (
                                    <button
                                      key={level}
                                      type="button"
                                      onClick={() => togglePickerLevel(level)}
                                      className={`rounded border px-2 py-1 text-xs ${
                                        active
                                          ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                          : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                                      }`}
                                    >
                                      {level}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-wide text-zinc-500">Item Type</p>
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPickerItemTypesSelected([])}
                                  className={`rounded border px-2 py-1 text-xs ${
                                    pickerItemTypesSelected.length === 0
                                      ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                      : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                                  }`}
                                >
                                  All
                                </button>
                                {PICKER_ITEM_TYPE_OPTIONS.map((option) => {
                                  const active = pickerItemTypesSelected.includes(option.value);
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => togglePickerItemType(option.value)}
                                      className={`rounded border px-2 py-1 text-xs ${
                                        active
                                          ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                          : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-wide text-zinc-500">Rarity</p>
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPickerRaritiesSelected([])}
                                  className={`rounded border px-2 py-1 text-xs ${
                                    pickerRaritiesSelected.length === 0
                                      ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                      : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                                  }`}
                                >
                                  All
                                </button>
                                {ITEM_RARITIES.map((rarity) => {
                                  const active = pickerRaritiesSelected.includes(rarity);
                                  return (
                                    <button
                                      key={rarity}
                                      type="button"
                                      onClick={() => togglePickerRarity(rarity)}
                                      className={`rounded border px-2 py-1 text-xs ${
                                        active
                                          ? "border-emerald-600 bg-emerald-950/20 text-emerald-100"
                                          : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                                      }`}
                                    >
                                      {formatItemRarityLabel(rarity)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={pickerExcludeLegendary}
                                onChange={(event) =>
                                  setPickerExcludeLegendary(event.target.checked)
                                }
                                className="h-4 w-4"
                              />
                              Exclude Legendary
                            </label>

                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={pickerExcludeMythic}
                                onChange={(event) => setPickerExcludeMythic(event.target.checked)}
                                className="h-4 w-4"
                              />
                              Exclude Mythic
                            </label>

                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={clearPickerFilters}
                                className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {activePickerFilterPills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {activePickerFilterPills.map((pill) => (
                          <button
                            key={pill.id}
                            type="button"
                            onClick={() => removePickerFilterPill(pill.id)}
                            className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                          >
                            <span>{pill.label}</span>
                            <span aria-hidden="true">x</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                <h2 className="text-lg font-semibold">
                  {canAssignPartyStash ? "Party Stash Manager" : "Party Stash"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {canAssignPartyStash
                    ? "You can assign unclaimed stash items to active characters."
                    : "These items are held by the party but are not currently assigned to a character. This view is read-only."}
                </p>
              </section>
            )}

            {payload.partyItems.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-500">
                {canManageInventory
                  ? "No Party Inventory items yet."
                  : "No unassigned Party Stash items are available."}
              </p>
            ) : (
              <section className="overflow-hidden rounded-xl border border-zinc-800">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-zinc-800 bg-zinc-900/70">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-zinc-300">Item</th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-300">
                        {canManageInventory ? "Quantity" : "Available"}
                      </th>
                      {canManageInventory && (
                        <th className="px-4 py-3 text-left font-medium text-zinc-300">
                          Backpacks
                        </th>
                      )}
                      {canAssignPartyStash && (
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
                                Available {item.availableQuantity}
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
                        {canManageInventory && (
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
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        )}
                        {canAssignPartyStash && (
                          <td className="px-4 py-4">
                            {assignmentTargets.length === 0 ? (
                              <span className="text-zinc-500">No active characters available.</span>
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
