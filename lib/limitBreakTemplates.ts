import type { Prisma } from "@prisma/client";

export type LimitBreakTemplateTypeValue = "PLAYER" | "MYTHIC_ITEM" | "MONSTER";
export type LimitBreakTierValue = "PUSH" | "BREAK" | "TRANSCEND";
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
  persistentStateText?: unknown;
  endConditionText?: unknown;
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
  persistentStateText: string | null;
  endConditionText: string | null;
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

  let isPersistent = parseBoolean(input.isPersistent, false);
  let persistentStateText = cleanString(input.persistentStateText);
  let endConditionText = cleanString(input.endConditionText);
  let endCostText = cleanString(input.endCostText);

  const persistenceAllowed =
    templateType === "PLAYER" &&
    (intention === "SUMMONING" || intention === "TRANSFORMATION");

  if (!persistenceAllowed) {
    isPersistent = false;
    persistentStateText = null;
    endConditionText = null;
    endCostText = null;
  } else if (isPersistent) {
    if (!endConditionText) {
      throw new LimitBreakTemplateValidationError(
        "End Condition is required when persistence is enabled",
      );
    }
    if (!endCostText) {
      throw new LimitBreakTemplateValidationError(
        "End Cost is required when persistence is enabled",
      );
    }
  } else {
    persistentStateText = null;
    endConditionText = null;
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
    baseCostKey: cleanString(input.baseCostKey),
    baseCostParams: parseJsonValue(input.baseCostParams, "Base Cost Params"),
    successEffectKey: cleanString(input.successEffectKey),
    successEffectParams: parseJsonValue(
      input.successEffectParams,
      "Success Effect Params",
    ),
    isPersistent,
    persistentStateText,
    endConditionText,
    endCostText,
    failForwardEnabled,
    failForwardEffectKey,
    failForwardEffectParams,
    failForwardCostAKey,
    failForwardCostBKey,
  };
}
