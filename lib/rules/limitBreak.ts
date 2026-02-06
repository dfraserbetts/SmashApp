import type { LimitBreakActorType, Prisma, PrismaClient } from "@prisma/client";

export type ThresholdPercent = 60 | 85 | 125;

type PrismaUsageClient = PrismaClient | Prisma.TransactionClient;

export type LimitBreakUsageParams = {
  actorType: LimitBreakActorType;
  actorId: string;
  abilityId: string;
  usedAtLevel: number;
  client: PrismaUsageClient;
};

export type LimitBreakProfileValidationInput = {
  thresholdPercent: number;
  failForwardEffectId?: string | null;
  failForwardCostAId?: string | null;
  failForwardCostBId?: string | null;
};

function hasId(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function computeIntensity(successCount: number, potency: number): number {
  return successCount * potency;
}

export function computePowerCeiling(
  diceCount: number,
  potency: number,
  personalLbDiceMax: number,
): number {
  return (diceCount + personalLbDiceMax) * potency;
}

export function computeThreshold(
  powerCeiling: number,
  thresholdPercent: ThresholdPercent,
): number {
  return Math.ceil((powerCeiling * thresholdPercent) / 100);
}

export function getTierThresholds(powerCeiling: number): {
  PUSH: number;
  BREAK: number;
  TRANSCEND: number;
} {
  return {
    PUSH: computeThreshold(powerCeiling, 60),
    BREAK: computeThreshold(powerCeiling, 85),
    TRANSCEND: computeThreshold(powerCeiling, 125),
  };
}

export async function canUseLimitBreak(params: LimitBreakUsageParams): Promise<boolean> {
  const existing = await params.client.abilityLimitBreakUsage.findFirst({
    where: {
      actorType: params.actorType,
      actorId: params.actorId,
      abilityId: params.abilityId,
      usedAtLevel: params.usedAtLevel,
    },
    select: { id: true },
  });

  return !existing;
}

export async function recordLimitBreakUse(params: LimitBreakUsageParams) {
  return params.client.abilityLimitBreakUsage.create({
    data: {
      actorType: params.actorType,
      actorId: params.actorId,
      abilityId: params.abilityId,
      usedAtLevel: params.usedAtLevel,
    },
  });
}

export function validateProfile(profile: LimitBreakProfileValidationInput): void {
  if (
    profile.thresholdPercent !== 60 &&
    profile.thresholdPercent !== 85 &&
    profile.thresholdPercent !== 125
  ) {
    throw new Error("thresholdPercent must be one of 60, 85, or 125");
  }

  const hasFailForwardEffect = hasId(profile.failForwardEffectId);
  const hasFailForwardCostA = hasId(profile.failForwardCostAId);
  const hasFailForwardCostB = hasId(profile.failForwardCostBId);
  const hasAnyFailForwardCost = hasFailForwardCostA || hasFailForwardCostB;

  if (hasFailForwardEffect && !hasAnyFailForwardCost) {
    throw new Error(
      "failForwardEffectId requires at least one fail-forward cost (A or B)",
    );
  }

  if (!hasFailForwardEffect && hasAnyFailForwardCost) {
    throw new Error(
      "fail-forward costs require failForwardEffectId to be set",
    );
  }
}
