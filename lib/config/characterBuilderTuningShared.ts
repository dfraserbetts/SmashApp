export const DEFAULT_CHARACTER_POWER_SPEND_SCALAR = 3;
export const MIN_CHARACTER_POWER_SPEND_SCALAR = 0.0001;
export const MAX_CHARACTER_POWER_SPEND_SCALAR = 20;

export type CharacterBuilderTuningSnapshot = {
  playerPowerSpendScalar: number;
  updatedAt: string | null;
};

export function normalizeCharacterPowerSpendScalar(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < MIN_CHARACTER_POWER_SPEND_SCALAR) {
    return DEFAULT_CHARACTER_POWER_SPEND_SCALAR;
  }
  return Math.min(MAX_CHARACTER_POWER_SPEND_SCALAR, parsed);
}

export function validateCharacterPowerSpendScalar(value: unknown):
  | { ok: true; value: number }
  | { ok: false; error: string } {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return { ok: false, error: "Character Power Spend Scalar must be a finite number." };
  }
  if (parsed < MIN_CHARACTER_POWER_SPEND_SCALAR) {
    return { ok: false, error: "Character Power Spend Scalar must be greater than 0." };
  }
  if (parsed > MAX_CHARACTER_POWER_SPEND_SCALAR) {
    return { ok: false, error: `Character Power Spend Scalar must be ${MAX_CHARACTER_POWER_SPEND_SCALAR} or less.` };
  }
  return { ok: true, value: parsed };
}

export function calculateCharacterPlayerPowerSpend(
  basePowerValue: number,
  playerPowerSpendScalar: number,
): number {
  return Math.ceil(Math.max(0, basePowerValue) * normalizeCharacterPowerSpendScalar(playerPowerSpendScalar));
}
