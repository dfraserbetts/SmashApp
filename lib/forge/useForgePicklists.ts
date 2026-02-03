// lib/forge/useForgePicklists.ts
'use client';

import { useEffect, useState } from 'react';
// ---------- Client-safe Picklist Types ----------

export type DamageType = {
  id: number;
  name: string;
  // From Supabase DamageType.attackMode
  attackMode?: 'PHYSICAL' | 'MENTAL';
};

export type AttackEffect = {
  id: number;
  name: string;
};

export type DefEffect = {
  id: number;
  name: string;
};

export type WeaponAttribute = {
  id: number;
  name: string;

  // Authored in Admin UI
  descriptorTemplate?: string | null;
  descriptorNotes?: string | null;

  // Gating / parameter flags (admin-driven)
  requiresRange?: 'MELEE' | 'RANGED' | 'AOE' | null;
  requiresAoeShape?: 'SPHERE' | 'CONE' | 'LINE' | null;
  requiresStrengthSource?: boolean;

  // Parameterisation
  requiresRangeSelection?: boolean;
};

export type ArmorAttribute = {
  id: number;
  name: string;

  // Authored in Admin UI
  descriptorTemplate?: string | null;
  descriptorNotes?: string | null;
};

export type ShieldAttribute = {
  id: number;
  name: string;

  // Authored in Admin UI
  descriptorTemplate?: string | null;
  descriptorNotes?: string | null;
};

export type WardingOption = {
  id: number;
  name: string;
};

export type SanctifiedOption = {
  id: number;
  name: string;
};

export type ForgeConfigEntry = {
  id: number;
  selector1: string;
  selector2?: string | null;
  multiplier: number;
};

export type ForgeCostEntry = {
  key: string;
  cost: number;
};

export type ForgePicklists = {
  damageTypes: DamageType[];
  attackEffects: AttackEffect[];
  defEffects: DefEffect[];
  weaponAttributes: WeaponAttribute[];
  armorAttributes: ArmorAttribute[];
  shieldAttributes: ShieldAttribute[];
  wardingOptions: WardingOption[];
  sanctifiedOptions: SanctifiedOption[];
  config: ForgeConfigEntry[];
  costs: ForgeCostEntry[];
};

type ForgePicklistsState = {
  data: ForgePicklists | null;
  loading: boolean;
  error: string | null;
};

// simple module-level cache so we only fetch once per session
let cachedPicklists: ForgePicklists | null = null;
let cachedPromise: Promise<ForgePicklists> | null = null;

async function fetchPicklists(): Promise<ForgePicklists> {
  if (cachedPicklists) return cachedPicklists;
  if (cachedPromise) return cachedPromise;

  cachedPromise = fetch('/api/forge/picklists')
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Picklists request failed: ${res.status}`);
      }
      const json = await res.json();

      // Very light runtime check to avoid undefined fields biting us later
      const result: ForgePicklists = {
        damageTypes: json.damageTypes ?? [],
        attackEffects: json.attackEffects ?? [],
        defEffects: json.defEffects ?? [],
        weaponAttributes: json.weaponAttributes ?? [],
        armorAttributes: json.armorAttributes ?? [],
        shieldAttributes: json.shieldAttributes ?? [],
        wardingOptions: json.wardingOptions ?? [],
        sanctifiedOptions: json.sanctifiedOptions ?? [],
        config: json.config ?? [],
        costs: json.costs ?? [],
      };

      cachedPicklists = result;
      return result;
    })
    .finally(() => {
      // if request failed, clear promise so we can retry
      cachedPromise = null;
    });

  return cachedPromise;
}

export function useForgePicklists(): ForgePicklistsState {
  const [state, setState] = useState<ForgePicklistsState>({
    data: cachedPicklists,
    loading: !cachedPicklists,
    error: null,
  });

  useEffect(() => {
    if (cachedPicklists) {
      // already have data, nothing to do
      return;
    }

    let cancelled = false;

    fetchPicklists()
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Unknown error fetching picklists';
        setState({ data: null, loading: false, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
