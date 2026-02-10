import type { Prisma } from "@prisma/client";

export type LimitBreakTemplateTypeValue = "PLAYER" | "MYTHIC_ITEM" | "MONSTER";
export type LimitBreakTierValue = "PUSH" | "BREAK" | "TRANSCEND";
export type PersistentCostTimingValue = "BEGIN" | "END";
export type IntentionTypeValue =
  | "ATTACK"
  | "DEFENCE"
  | "HEALING"
  | "MOVEMENT"
  | "CLEANSE"
  | "CONTROL"
  | "AUGMENT"
  | "DEBUFF"
  | "SUMMONING"
  | "TRANSFORMATION"
  | "SUPPORT";

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

export class LimitBreakTemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitBreakTemplateValidationError";
  }
}

type LimitBreakTemplateInput = {
  name?: unknown;
  templateType?: unknown;
  tier?: unknown;
  thresholdPercent?: unknown;
  description?: unknown;
  intention?: unknown;
  itemType?: unknown;
  monsterCategory?: unknown;
  baseCostKey?: unknown;
  baseCostParams?: unknown;
  successEffectKey?: unknown;
  successEffectParams?: unknown;
  isPersistent?: unknown;
  persistentCostTiming?: unknown;
  persistentStateText?: unknown;
  endConditionText?: unknown;
  endCostKey?: unknown;
  endCostParams?: unknown;
  endCostText?: unknown;
  failForwardEnabled?: unknown;
  failForwardEffectKey?: unknown;
  failForwardEffectParams?: unknown;
  failForwardCostAKey?: unknown;
  failForwardCostBKey?: unknown;
};

export type NormalizedLimitBreakTemplate = {
  name: string;
  templateType: LimitBreakTemplateTypeValue;
  tier: LimitBreakTierValue;
  thresholdPercent: 60 | 85 | 125;
  description: string | null;
  intention: IntentionTypeValue | null;
  itemType: string | null;
  monsterCategory: string | null;
  baseCostKey: string | null;
  baseCostParams: Prisma.InputJsonValue;
  successEffectKey: string | null;
  successEffectParams: Prisma.InputJsonValue;
  isPersistent: boolean;
  persistentCostTiming: PersistentCostTimingValue | null;
  persistentStateText: string | null;
  endConditionText: string | null;
  endCostKey: string | null;
  endCostParams: Prisma.InputJsonValue;
  endCostText: string | null;
  failForwardEnabled: boolean;
  failForwardEffectKey: string | null;
  failForwardEffectParams: Prisma.InputJsonValue;
  failForwardCostAKey: string | null;
  failForwardCostBKey: string | null;
};

const TEMPLATE_TYPES = new Set<LimitBreakTemplateTypeValue>([
  "PLAYER",
  "MYTHIC_ITEM",
  "MONSTER",
]);

const TIERS = new Set<LimitBreakTierValue>(["PUSH", "BREAK", "TRANSCEND"]);
const PERSISTENT_COST_TIMINGS = new Set<PersistentCostTimingValue>(["BEGIN", "END"]);

const INTENTIONS = new Set<IntentionTypeValue>([
  "ATTACK",
  "DEFENCE",
  "HEALING",
  "MOVEMENT",
  "CLEANSE",
  "CONTROL",
  "AUGMENT",
  "DEBUFF",
  "SUMMONING",
  "TRANSFORMATION",
  "SUPPORT",
]);

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const out = value.trim();
  return out.length > 0 ? out : null;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function parseJsonValue(value: unknown, fieldName: string): Prisma.InputJsonValue {
  if (value === undefined || value === null || value === "") {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as JsonLike;
      return parsed as Prisma.InputJsonValue;
    } catch {
      throw new LimitBreakTemplateValidationError(
        `${fieldName} must be valid JSON`,
      );
    }
  }

  if (typeof value === "object" || typeof value === "number" || typeof value === "boolean") {
    return value as Prisma.InputJsonValue;
  }

  throw new LimitBreakTemplateValidationError(`${fieldName} must be valid JSON`);
}

function inferDefaultPersistentCostTiming(
  successEffectParams: Prisma.InputJsonValue,
): PersistentCostTimingValue {
  if (
    successEffectParams &&
    typeof successEffectParams === "object" &&
    !Array.isArray(successEffectParams)
  ) {
    const endRule = (successEffectParams as Record<string, unknown>).endRule;
    if (typeof endRule === "string") {
      const normalized = endRule.trim().toLowerCase();
      if (
        normalized === "until_destroyed" ||
        normalized === "until-destroyed" ||
        normalized === "until destroyed"
      ) {
        return "BEGIN";
      }
    }
  }

  return "END";
}

export function tierToThresholdPercent(tier: LimitBreakTierValue): 60 | 85 | 125 {
  if (tier === "PUSH") return 60;
  if (tier === "BREAK") return 85;
  return 125;
}

export function normalizeAndValidateTemplate(
  input: LimitBreakTemplateInput,
): NormalizedLimitBreakTemplate {
  const name = cleanString(input.name);
  if (!name) {
    throw new LimitBreakTemplateValidationError("Name is required");
  }

  const templateType =
    typeof input.templateType === "string" && TEMPLATE_TYPES.has(input.templateType as LimitBreakTemplateTypeValue)
      ? (input.templateType as LimitBreakTemplateTypeValue)
      : null;
  if (!templateType) {
    throw new LimitBreakTemplateValidationError(
      "Template Type must be PLAYER, MYTHIC_ITEM, or MONSTER",
    );
  }

  const tier =
    typeof input.tier === "string" && TIERS.has(input.tier as LimitBreakTierValue)
      ? (input.tier as LimitBreakTierValue)
      : null;
  if (!tier) {
    throw new LimitBreakTemplateValidationError(
      "Tier must be PUSH, BREAK, or TRANSCEND",
    );
  }

  const thresholdPercent = tierToThresholdPercent(tier);

  const rawIntention = cleanString(input.intention);
  const intention =
    rawIntention && INTENTIONS.has(rawIntention as IntentionTypeValue)
      ? (rawIntention as IntentionTypeValue)
      : null;
  if (rawIntention && !intention) {
    throw new LimitBreakTemplateValidationError("Invalid intention value");
  }

  let itemType = cleanString(input.itemType);
  let monsterCategory = cleanString(input.monsterCategory);

  if (templateType === "PLAYER" && !intention) {
    throw new LimitBreakTemplateValidationError(
      "Intention is required for PLAYER templates",
    );
  }

  if (templateType === "MYTHIC_ITEM" && !itemType) {
    throw new LimitBreakTemplateValidationError(
      "Item Type is required for MYTHIC_ITEM templates",
    );
  }

  if (templateType !== "MYTHIC_ITEM") {
    itemType = null;
  }

  if (templateType !== "MONSTER") {
    monsterCategory = null;
  }

  let baseCostKey = cleanString(input.baseCostKey);
  let baseCostParams = parseJsonValue(input.baseCostParams, "Base Cost Params");
  const successEffectParams = parseJsonValue(
    input.successEffectParams,
    "Success Effect Params",
  );

  let isPersistent = parseBoolean(input.isPersistent, false);
  const rawPersistentCostTiming = cleanString(input.persistentCostTiming);
  let persistentCostTiming =
    rawPersistentCostTiming &&
    PERSISTENT_COST_TIMINGS.has(rawPersistentCostTiming.toUpperCase() as PersistentCostTimingValue)
      ? (rawPersistentCostTiming.toUpperCase() as PersistentCostTimingValue)
      : null;
  if (rawPersistentCostTiming && !persistentCostTiming) {
    throw new LimitBreakTemplateValidationError(
      "Persistent Cost Timing must be BEGIN or END",
    );
  }
  let persistentStateText = cleanString(input.persistentStateText);
  let endConditionText = cleanString(input.endConditionText);
  let endCostKey = cleanString(input.endCostKey);
  let endCostParams = parseJsonValue(input.endCostParams, "End Cost Params");
  let endCostText = cleanString(input.endCostText);

  const persistenceAllowed =
    templateType === "PLAYER" &&
    (intention === "SUMMONING" || intention === "TRANSFORMATION");

  if (!persistenceAllowed) {
    isPersistent = false;
    persistentCostTiming = null;
    persistentStateText = null;
    endConditionText = null;
    endCostKey = null;
    endCostParams = {};
    endCostText = null;
  } else if (isPersistent) {
    if (!persistentCostTiming) {
      persistentCostTiming = inferDefaultPersistentCostTiming(successEffectParams);
    }

    if (!endConditionText) {
      throw new LimitBreakTemplateValidationError(
        "End Condition is required when persistence is enabled",
      );
    }

    if (persistentCostTiming === "BEGIN") {
      endCostKey = null;
      endCostParams = {};
      endCostText = null;
    } else {
      baseCostKey = null;
      baseCostParams = {};

      if (!endCostText) {
        throw new LimitBreakTemplateValidationError(
          "End Cost text is required when persistence cost timing is END",
        );
      }
    }
  } else {
    persistentCostTiming = null;
    persistentStateText = null;
    endConditionText = null;
    endCostKey = null;
    endCostParams = {};
    endCostText = null;
  }

  let failForwardEnabled = parseBoolean(input.failForwardEnabled, false);
  let failForwardEffectKey = cleanString(input.failForwardEffectKey);
  let failForwardCostAKey = cleanString(input.failForwardCostAKey);
  let failForwardCostBKey = cleanString(input.failForwardCostBKey);
  let failForwardEffectParams = parseJsonValue(
    input.failForwardEffectParams,
    "Fail-forward Effect Params",
  );

  if (failForwardEnabled) {
    if (!failForwardEffectKey) {
      throw new LimitBreakTemplateValidationError(
        "Fail-forward Effect Key is required when fail-forward is enabled",
      );
    }
    if (!failForwardCostAKey && !failForwardCostBKey) {
      throw new LimitBreakTemplateValidationError(
        "At least one fail-forward cost key is required when fail-forward is enabled",
      );
    }
  } else {
    failForwardEnabled = false;
    failForwardEffectKey = null;
    failForwardCostAKey = null;
    failForwardCostBKey = null;
    failForwardEffectParams = {};
  }

  return {
    name,
    templateType,
    tier,
    thresholdPercent,
    description: cleanString(input.description),
    intention,
    itemType,
    monsterCategory,
    baseCostKey,
    baseCostParams,
    successEffectKey: cleanString(input.successEffectKey),
    successEffectParams,
    isPersistent,
    persistentCostTiming,
    persistentStateText,
    endConditionText,
    endCostKey,
    endCostParams,
    endCostText,
    failForwardEnabled,
    failForwardEffectKey,
    failForwardEffectParams,
    failForwardCostAKey,
    failForwardCostBKey,
  };
}
