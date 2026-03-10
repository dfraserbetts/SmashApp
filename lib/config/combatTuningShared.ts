export const DEFAULT_PROTECTION_K = 2;
export const DEFAULT_PROTECTION_S = 6;

export type ProtectionTuningValues = {
  protectionK: number;
  protectionS: number;
};

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

export function normalizeProtectionTuning(
  protectionK: unknown,
  protectionS: unknown,
): ProtectionTuningValues {
  return {
    protectionK: toPositiveNumber(protectionK, DEFAULT_PROTECTION_K),
    protectionS: toPositiveNumber(protectionS, DEFAULT_PROTECTION_S),
  };
}
