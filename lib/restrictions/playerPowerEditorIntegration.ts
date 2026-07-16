import type { CharacterBuilderData } from "@/lib/characterBuilder/core";
import type { CharacterPower } from "@/lib/characterBuilder/powers";
import {
  normalizeRestrictionDefinition,
  validateRestrictionDefinition,
  type AbilityRestrictionDefinitionV1,
  type RestrictionIssue,
} from "@/lib/restrictions";
import {
  createRestrictionDraftFromDefinition,
  resolveRestrictionEditorDraft,
  type RestrictionDraftResolution,
  type RestrictionDraftResolutionStatus,
  type RestrictionEditorDraft,
} from "@/lib/restrictions/editorModel";

export type PlayerPowerRestrictionDraftMap = Record<string, RestrictionEditorDraft>;

export type PlayerPowerRestrictionConsumerKind = "POWER" | "SIGNATURE_MOVE";

export type PlayerPowerRestrictionBlockingIssue = {
  consumerKind: PlayerPowerRestrictionConsumerKind;
  powerIndex: number | null;
  powerId: string;
  powerName: string;
  resolutionStatus: RestrictionDraftResolutionStatus | "MISSING_DRAFT" | "MISSING_POWER_ID";
  issueCodes: string[];
  issueMessages: string[];
  message: string;
};

export type PlayerPowerRestrictionMaterializationResult =
  | {
      ok: true;
      builderData: CharacterBuilderData;
      issues: [];
    }
  | {
      ok: false;
      builderData: null;
      issues: PlayerPowerRestrictionBlockingIssue[];
    };

export type PlayerPowerRestrictionWriteIssue = {
  consumerKind: PlayerPowerRestrictionConsumerKind;
  powerIndex: number | null;
  powerId: string | null;
  powerName: string;
  code: string;
  message: string;
  clientMessage: string;
};

type PowerConsumer = {
  consumerKind: PlayerPowerRestrictionConsumerKind;
  powerIndex: number | null;
  power: CharacterPower;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function powerId(power: Pick<CharacterPower, "id">): string | null {
  const value = power.id?.trim();
  return value ? value : null;
}

function powerName(consumer: PowerConsumer): string {
  const name = consumer.power.name?.trim();
  if (name) return name;
  return consumer.consumerKind === "SIGNATURE_MOVE"
    ? "Signature Move"
    : `Power ${(consumer.powerIndex ?? 0) + 1}`;
}

function consumersFromBuilderData(builderData: CharacterBuilderData): PowerConsumer[] {
  return [
    ...builderData.powers.map((power, powerIndex) => ({
      consumerKind: "POWER" as const,
      powerIndex,
      power,
    })),
    ...(builderData.signatureMove
      ? [{
          consumerKind: "SIGNATURE_MOVE" as const,
          powerIndex: null,
          power: builderData.signatureMove,
        }]
      : []),
  ];
}

export function getPlayerPowerRestrictionDraftKey(
  power: Pick<CharacterPower, "id">,
): string | null {
  return powerId(power);
}

export function initializePlayerPowerRestrictionDrafts(
  builderData: CharacterBuilderData,
): PlayerPowerRestrictionDraftMap {
  const drafts: PlayerPowerRestrictionDraftMap = {};
  for (const consumer of consumersFromBuilderData(builderData)) {
    const id = powerId(consumer.power);
    if (!id) continue;
    drafts[id] = createRestrictionDraftFromDefinition(consumer.power.restriction);
  }
  return drafts;
}

export function reconcilePlayerPowerRestrictionDrafts(
  current: PlayerPowerRestrictionDraftMap,
  builderData: CharacterBuilderData,
): PlayerPowerRestrictionDraftMap {
  const next: PlayerPowerRestrictionDraftMap = {};
  for (const consumer of consumersFromBuilderData(builderData)) {
    const id = powerId(consumer.power);
    if (!id) continue;
    next[id] = current[id]
      ?? createRestrictionDraftFromDefinition(consumer.power.restriction);
  }
  return next;
}

export function rehydratePlayerPowerRestrictionDrafts(
  authoritativeBuilderData: CharacterBuilderData,
): PlayerPowerRestrictionDraftMap {
  return initializePlayerPowerRestrictionDrafts(authoritativeBuilderData);
}

export function resolvePlayerPowerRestrictionDraft(
  draft: RestrictionEditorDraft,
): RestrictionDraftResolution {
  return resolveRestrictionEditorDraft(draft, { consumerNoun: "Power" });
}

function blockingIssue(
  consumer: PowerConsumer,
  status: PlayerPowerRestrictionBlockingIssue["resolutionStatus"],
  issues: readonly RestrictionIssue[],
): PlayerPowerRestrictionBlockingIssue {
  const id = powerId(consumer.power) ?? "missing-power-id";
  const name = powerName(consumer);
  const issueCodes = issues.map((issue) => issue.code);
  const issueMessages = issues.map((issue) => issue.message);
  const prefix = consumer.consumerKind === "SIGNATURE_MOVE"
    ? `Signature Move "${name}"`
    : `Power ${(consumer.powerIndex ?? 0) + 1} "${name}"`;
  const detail = issueMessages.length > 0
    ? issueMessages.join(" ")
    : "The Restriction draft cannot be saved.";
  return {
    consumerKind: consumer.consumerKind,
    powerIndex: consumer.powerIndex,
    powerId: id,
    powerName: name,
    resolutionStatus: status,
    issueCodes,
    issueMessages,
    message: `${prefix}: ${detail}`,
  };
}

function materializedRestriction(
  resolution: RestrictionDraftResolution,
): AbilityRestrictionDefinitionV1 | null {
  if (resolution.status === "NONE") return null;
  if (
    resolution.status === "VALID"
    || resolution.status === "CAMPAIGN_CUSTOM_READ_ONLY"
    || resolution.status === "UNSUPPORTED_READ_ONLY"
  ) {
    return resolution.definition;
  }
  return null;
}
export function materializePlayerPowerRestrictionDrafts(
  source: CharacterBuilderData,
  drafts: PlayerPowerRestrictionDraftMap,
): PlayerPowerRestrictionMaterializationResult {
  const consumers = consumersFromBuilderData(source);
  const blocking: PlayerPowerRestrictionBlockingIssue[] = [];
  const resolvedById = new Map<string, AbilityRestrictionDefinitionV1 | null>();

  for (const consumer of consumers) {
    const id = powerId(consumer.power);
    if (!id) {
      blocking.push(blockingIssue(consumer, "MISSING_POWER_ID", [{
        code: "PLAYER_POWER_ID_REQUIRED",
        severity: "error",
        message: "A stable Power identity is required before its Restriction can be saved.",
        path: "id",
      }]));
      continue;
    }
    const draft = drafts[id];
    if (!draft) {
      blocking.push(blockingIssue(consumer, "MISSING_DRAFT", [{
        code: "PLAYER_POWER_RESTRICTION_DRAFT_REQUIRED",
        severity: "error",
        message: "The transient Restriction draft is missing and must be reloaded before saving.",
        path: "restriction",
      }]));
      continue;
    }
    const resolution = resolvePlayerPowerRestrictionDraft(draft);
    if (resolution.status === "INCOMPLETE" || resolution.status === "INVALID") {
      blocking.push(blockingIssue(consumer, resolution.status, resolution.issues));
      continue;
    }
    resolvedById.set(id, materializedRestriction(resolution));
  }

  if (blocking.length > 0) {
    return { ok: false, builderData: null, issues: blocking };
  }

  const powers = source.powers.map((power) => ({
    ...power,
    restriction: resolvedById.get(powerId(power)!) ?? null,
  }));
  const signatureMove = source.signatureMove
    ? {
        ...source.signatureMove,
        restriction: resolvedById.get(powerId(source.signatureMove)!) ?? null,
      }
    : null;
  return {
    ok: true,
    builderData: { ...source, powers, signatureMove },
    issues: [],
  };
}

export function getPlayerPowerRestrictionSummaryLabel(
  draft: RestrictionEditorDraft,
): string {
  const resolution = resolvePlayerPowerRestrictionDraft(draft);
  if (resolution.status === "NONE") return "No Restriction";
  if (resolution.status === "INCOMPLETE") return "Incomplete Restriction Draft";
  if (resolution.status === "INVALID") return "Invalid Restriction Draft";
  if (resolution.status === "CAMPAIGN_CUSTOM_READ_ONLY") return "Campaign-Custom Restriction";
  if (resolution.status === "UNSUPPORTED_READ_ONLY") return "Unsupported Restriction";
  return resolution.definition?.authoringMode === "CUSTOM_NARRATIVE"
    ? "Fully Custom Restriction"
    : "Standard Restriction";
}

function rawConsumerLabel(
  consumerKind: PlayerPowerRestrictionConsumerKind,
  powerIndex: number | null,
  name: string,
): string {
  return consumerKind === "SIGNATURE_MOVE"
    ? `Signature Move "${name}"`
    : `Power ${(powerIndex ?? 0) + 1} "${name}"`;
}

function firstError(issues: readonly RestrictionIssue[]): RestrictionIssue | null {
  return issues.find((issue) => issue.severity === "error") ?? null;
}

function validateRawRestriction(
  restriction: unknown,
  campaignId: string,
): RestrictionIssue | null {
  const normalized = normalizeRestrictionDefinition(restriction);
  const normalizationError = firstError(normalized.issues);
  if (!normalized.definition || normalizationError) {
    return normalizationError ?? {
      code: "INVALID_DEFINITION",
      severity: "error",
      message: "The Restriction definition is malformed.",
      path: "restriction",
    };
  }

  for (const [key, value] of Object.entries(normalized.definition.parameters)) {
    if (value.kind === "CAMPAIGN_REFERENCE" && value.campaignId !== campaignId) {
      return {
        code: "CROSS_CAMPAIGN_REFERENCE",
        severity: "error",
        message: "Campaign references must belong to the active campaign.",
        path: `parameters.${key}`,
      };
    }
  }

  const validationIssues = validateRestrictionDefinition(
    normalized.definition,
    { campaignId },
  );
  const errors = validationIssues.filter((issue) => issue.severity === "error");
  if (errors.length === 0) return null;
  if (errors.every((issue) => issue.code === "UNKNOWN_TEMPLATE")) return null;
  return errors[0];
}

export function validateRawPlayerPowerRestrictionWrite(
  builderData: unknown,
  campaignId: string,
): PlayerPowerRestrictionWriteIssue | null {
  const rawBuilderData = readRecord(builderData);
  const consumers: Array<{
    consumerKind: PlayerPowerRestrictionConsumerKind;
    powerIndex: number | null;
    power: Record<string, unknown>;
  }> = [];
  if (Array.isArray(rawBuilderData.powers)) {
    rawBuilderData.powers.forEach((value, powerIndex) => {
      consumers.push({ consumerKind: "POWER", powerIndex, power: readRecord(value) });
    });
  }
  if (rawBuilderData.signatureMove && typeof rawBuilderData.signatureMove === "object") {
    consumers.push({
      consumerKind: "SIGNATURE_MOVE",
      powerIndex: null,
      power: readRecord(rawBuilderData.signatureMove),
    });
  }

  for (const consumer of consumers) {
    if (!Object.prototype.hasOwnProperty.call(consumer.power, "restriction")) continue;
    const restriction = consumer.power.restriction;
    if (restriction == null) continue;
    const issue = validateRawRestriction(restriction, campaignId);
    if (!issue) continue;
    const id = typeof consumer.power.id === "string" && consumer.power.id.trim()
      ? consumer.power.id.trim()
      : null;
    const submittedName = typeof consumer.power.name === "string"
      ? consumer.power.name.trim()
      : "";
    const name = submittedName || (consumer.consumerKind === "SIGNATURE_MOVE"
      ? "Signature Move"
      : `Power ${(consumer.powerIndex ?? 0) + 1}`);
    const label = rawConsumerLabel(consumer.consumerKind, consumer.powerIndex, name);
    return {
      consumerKind: consumer.consumerKind,
      powerIndex: consumer.powerIndex,
      powerId: id,
      powerName: name,
      code: issue.code,
      message: issue.message,
      clientMessage: `${label} Restriction [${issue.code}]: ${issue.message}`,
    };
  }
  return null;
}
