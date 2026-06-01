type VrpEntryWithDamageType = {
  damageTypeId: number;
};

export function isSelectableDamageTypeName(name: string): boolean {
  return name.trim().toLowerCase() !== "corruption";
}

export function sanitizeDamageTypeIds(
  ids: number[] | null | undefined,
  selectableDamageTypeIds: Set<number>,
): number[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(
    new Set(
      ids
        .map((id) => (typeof id === "number" ? id : Number(id)))
        .filter((id) => Number.isInteger(id) && selectableDamageTypeIds.has(id)),
    ),
  );
}

export function sanitizeVRPEntries<T extends VrpEntryWithDamageType>(
  entries: T[] | null | undefined,
  selectableDamageTypeIds: Set<number>,
): T[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => selectableDamageTypeIds.has(Number(entry?.damageTypeId)));
}
