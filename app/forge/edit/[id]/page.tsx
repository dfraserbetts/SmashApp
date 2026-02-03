'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams, useRouter } from 'next/navigation';
import type { ItemType, ItemRarity } from '../../../../lib/forge/types';
type LoadedItem = {
  id: string;
  name: string;
  rarity: ItemRarity;
  level: number;
  type: ItemType;
  generalDescription: string;
};

const ITEM_TYPES: ItemType[] = ['WEAPON', 'ARMOR', 'SHIELD', 'ITEM'];
const ITEM_RARITIES: ItemRarity[] = [
  'COMMON',
  'UNCOMMON',
  'RARE',
  'LEGENDARY',
  'MYTHIC',
];

type ForgeBasicFormValues = {
  name: string;
  rarity: ItemRarity;
  level: number;
  type: ItemType;
  generalDescription: string;
};

export default function ForgeEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loadedItem, setLoadedItem] = useState<LoadedItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ForgeBasicFormValues>({
    defaultValues: {
      name: '',
      rarity: 'COMMON',
      level: 1,
      type: 'WEAPON',
      generalDescription: '',
    },
  });

  // Load existing item
  useEffect(() => {
    let cancelled = false;

    async function loadItem() {
      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch(`/api/forge/items/${encodeURIComponent(id)}`);
        if (!res.ok) {
          throw new Error(`Failed to load item (${res.status})`);
        }

        const item = (await res.json()) as LoadedItem;
        if (cancelled) return;

        setLoadedItem(item);

        // Populate form with existing values
        reset({
          name: item.name,
          rarity: item.rarity,
          level: item.level,
          type: item.type,
          generalDescription: item.generalDescription,
        });

        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Unknown error loading item';
        setLoadError(message);
        setLoading(false);
      }
    }

    loadItem();

    return () => {
      cancelled = true;
    };
  }, [id, reset]);

  async function onSubmit(values: ForgeBasicFormValues) {
    if (!loadedItem) return;

    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await fetch(`/api/forge/items/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        // Only send scalar fields we know the API supports updating
        body: JSON.stringify({
          name: values.name,
          rarity: values.rarity,
          level: values.level,
          type: values.type,
          generalDescription: values.generalDescription,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Failed to update item (status ${res.status})`);
      }

      // We deliberately don&apos;t assume the shape of the response body here.
      // Just treat the update as successful and sync local state.
      setLoadedItem({
        ...loadedItem,
        name: values.name,
        rarity: values.rarity,
        level: values.level,
        type: values.type,
        generalDescription: values.generalDescription,
      });

      setSubmitSuccess('Item updated successfully.');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown error updating item';
      setSubmitError(message);
    }
  }

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col md:flex-row">
      {/* FORM COLUMN */}
      <div className="w-full md:w-1/2 p-6 md:p-8 border-b md:border-b-0 md:border-r border-zinc-800 overflow-y-auto">
        <button
          type="button"
          onClick={() => router.push('/forge/library')}
          className="mb-4 text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Back to Library
        </button>

        <h1 className="text-2xl font-bold mb-2">Edit Item Template</h1>
        <p className="text-sm text-zinc-400 mb-4">
          Tweak the stats. Try not to break the multiverse.
        </p>

        {loading && (
          <p className="text-sm text-zinc-500 mb-2">
            Loading item details…
          </p>
        )}

        {loadError && (
          <p className="text-sm text-red-400 mb-2">
            Failed to load item: {loadError}
          </p>
        )}

        {loadedItem && (
          <p className="text-xs text-zinc-500 mb-4">
            Editing <span className="font-mono">{loadedItem.id}</span>
          </p>
        )}

        {submitError && (
          <p className="mb-2 text-sm text-red-400">
            Error updating item: {submitError}
          </p>
        )}
        {submitSuccess && (
          <p className="mb-2 text-sm text-emerald-400">{submitSuccess}</p>
        )}

        {/* Only show form once item is loaded */}
        {!loading && !loadError && loadedItem && (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4"
          >
            {/* Item Name */}
            <div className="space-y-1">
              <label className="block text-sm font-medium">Item Name</label>
              <input
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('name', { required: 'Name is required' })}
              />
              {errors.name && (
                <p className="text-xs text-red-400">{errors.name.message}</p>
              )}
            </div>

            {/* Item Type & Rarity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium">Item Type</label>
                <select
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  {...register('type', { required: true })}
                >
                  {ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium">Rarity</label>
                <select
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  {...register('rarity', { required: true })}
                >
                  {ITEM_RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Level */}
            <div className="space-y-1">
              <label className="block text-sm font-medium">Item Level</label>
              <input
                type="number"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('level', {
                  required: 'Level is required',
                  valueAsNumber: true,
                  min: { value: 1, message: 'Minimum level is 1' },
                })}
              />
              {errors.level && (
                <p className="text-xs text-red-400">{errors.level.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="block text-sm font-medium">
                General Description
              </label>
              <textarea
                rows={4}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register('generalDescription', {
                  required: 'Description is required',
                })}
              />
              {errors.generalDescription && (
                <p className="text-xs text-red-400">
                  {errors.generalDescription.message}
                </p>
              )}
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Updating…' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() =>
                  reset({
                    name: loadedItem.name,
                    rarity: loadedItem.rarity,
                    level: loadedItem.level,
                    type: loadedItem.type,
                    generalDescription: loadedItem.generalDescription,
                  })
                }
                className="inline-flex items-center rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
              >
                Reset
              </button>
            </div>
          </form>
        )}
      </div>

      {/* PREVIEW COLUMN */}
      <div className="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Preview</h2>
        <div className="rounded-xl border border-zinc-800 p-4 text-sm space-y-4">
          {!loadedItem && loading && (
            <p className="text-zinc-500">Summoning current stats…</p>
          )}

          {loadedItem && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Current template
              </p>
              <p className="text-lg font-semibold">{loadedItem.name}</p>
              <p className="text-xs text-zinc-400">
                {loadedItem.type} • {loadedItem.rarity} • Level{' '}
                {loadedItem.level}
              </p>
              <p className="mt-2 text-zinc-200">
                {loadedItem.generalDescription}
              </p>
            </div>
          )}

          {!loading && loadError && (
            <p className="text-red-400">
              Cannot show preview until the item loads.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
