// app/api/forge/items/vrp-utils.ts
import type { VRPEffectKind } from '@prisma/client';

export type VRPEntryInput = {
  effectKind: VRPEffectKind;
  magnitude: number;
  damageTypeId: number;
};

/**
 * Normalises VRP entries according to Forge rules:
 *
 * 1) Multiple entries allowed overall.
 * 2) For the same (effectKind, damageTypeId), the LAST entry wins.
 * 3) For a given damageTypeId you cannot have:
 *    - Vulnerability AND Resistance/Protection together.
 *    - When a Vulnerability is added, it replaces any existing VRP on that damage type.
 *    - When a Resistance/Protection is added, it replaces any existing Vulnerability
 *      on that damage type.
 *
 * Order of entries in the input array decides which one “wins”.
 */
export function normalizeVRPEntries(
  entries: VRPEntryInput[] | null | undefined,
): VRPEntryInput[] {
  if (!entries || !entries.length) return [];

  const map = new Map<string, VRPEntryInput>();

  for (const entry of entries) {
    if (!entry) continue;

    const { effectKind, magnitude, damageTypeId } = entry;

    if (effectKind == null || damageTypeId == null || magnitude == null) {
      continue;
    }

    const dmgKey = String(damageTypeId);

    if (effectKind === 'VULNERABILITY') {
      // Remove ANY VRP that already exists for this damage type
      for (const key of Array.from(map.keys())) {
        const [, existingDmg] = key.split(':');
        if (existingDmg === dmgKey) {
          map.delete(key);
        }
      }

      // Then set the Vulnerability for that damage type
      map.set(`VULNERABILITY:${dmgKey}`, entry);
    } else {
      // RESISTANCE / PROTECTION
      // First: remove any Vulnerability on this damage type
      map.delete(`VULNERABILITY:${dmgKey}`);

      // Then overwrite whatever same-effect entry was there before
      const key = `${effectKind}:${dmgKey}`;
      map.set(key, entry);
    }
  }

  return Array.from(map.values());
}
