import type { MonsterPower } from "@/lib/summoning/types";
import type { AbilityRestrictionDefinitionV1, RestrictionIssue } from "@/lib/restrictions";
import {
  createRestrictionDraftFromDefinition,
  resolveRestrictionEditorDraft,
  type RestrictionDraftResolution,
  type RestrictionDraftResolutionStatus,
  type RestrictionEditorDraft,
} from "@/lib/restrictions/editorModel";
import { normalizeMonsterRestrictionForWrite } from "@/lib/restrictions/monsterPersistence";

export type MonsterPowerRestrictionDraftMap = Record<string, RestrictionEditorDraft>;

export type MonsterPowerRestrictionBlockingIssue = {
  powerIndex: number;
  powerId: string;
  powerName: string;
  resolutionStatus: RestrictionDraftResolutionStatus | "MISSING_DRAFT" | "MISSING_POWER_ID";
  issueCodes: string[];
  issueMessages: string[];
  message: string;
};

export type MonsterPowerRestrictionMaterializationResult<TMonster> =
  | {
      ok: true;
      monster: TMonster;
      issues: [];
    }
  | {
      ok: false;
      monster: null;
      issues: MonsterPowerRestrictionBlockingIssue[];
    };

function powerId(power: Pick<MonsterPower, "id">): string | null {
  const value = power.id?.trim();
  return value ? value : null;
}

function powerName(power: MonsterPower, powerIndex: number): string {
  return power.name.trim() || `Power ${powerIndex + 1}`;
}

export function getMonsterPowerRestrictionDraftKey(
  power: Pick<MonsterPower, "id">,
): string | null {
  return powerId(power);
}

export function initializeMonsterPowerRestrictionDrafts(
  powers: readonly MonsterPower[],
): MonsterPowerRestrictionDraftMap {
  const drafts: MonsterPowerRestrictionDraftMap = {};
  for (const power of powers) {
    const id = powerId(power);
    if (!id) continue;
    drafts[id] = createRestrictionDraftFromDefinition(power.restriction);
  }
  return drafts;
}

export function reconcileMonsterPowerRestrictionDrafts(
  current: MonsterPowerRestrictionDraftMap,
  powers: readonly MonsterPower[],
): MonsterPowerRestrictionDraftMap {
  const next: MonsterPowerRestrictionDraftMap = {};
  for (const power of powers) {
    const id = powerId(power);
    if (!id) continue;
    next[id] = current[id] ?? createRestrictionDraftFromDefinition(power.restriction);
  }

  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  if (
    currentKeys.length === nextKeys.length
    && nextKeys.every((key) => current[key] === next[key])
  ) {
    return current;
  }
  return next;
}

export function rehydrateMonsterPowerRestrictionDrafts(
  authoritativePowers: readonly MonsterPower[],
): MonsterPowerRestrictionDraftMap {
  return initializeMonsterPowerRestrictionDrafts(authoritativePowers);
}

export function resolveMonsterPowerRestrictionDraft(
  draft: RestrictionEditorDraft,
): RestrictionDraftResolution {
  return resolveRestrictionEditorDraft(draft, { consumerNoun: "Power" });
}

function blockingIssue(
  power: MonsterPower,
  powerIndex: number,
  status: MonsterPowerRestrictionBlockingIssue["resolutionStatus"],
  issues: readonly RestrictionIssue[],
): MonsterPowerRestrictionBlockingIssue {
  const id = powerId(power) ?? "missing-power-id";
  const name = powerName(power, powerIndex);
  const issueCodes = issues.map((issue) => issue.code);
  const issueMessages = issues.map((issue) => issue.message);
  const detail = issueMessages.length > 0
    ? issueMessages.join(" ")
    : "The Restriction draft cannot be saved.";
  return {
    powerIndex,
    powerId: id,
    powerName: name,
    resolutionStatus: status,
    issueCodes,
    issueMessages,
    message: `Power ${powerIndex + 1} "${name}": ${detail}`,
  };
}

export function materializeMonsterPowerRestrictionDrafts<
  TMonster extends { powers: MonsterPower[] },
>(
  source: TMonster,
  drafts: MonsterPowerRestrictionDraftMap,
  context: { campaignId: string },
): MonsterPowerRestrictionMaterializationResult<TMonster> {
  const blocking: MonsterPowerRestrictionBlockingIssue[] = [];
  const resolvedById = new Map<string, AbilityRestrictionDefinitionV1 | null>();

  for (const [powerIndex, power] of source.powers.entries()) {
    const id = powerId(power);
    if (!id) {
      blocking.push(blockingIssue(power, powerIndex, "MISSING_POWER_ID", [{
        code: "MONSTER_POWER_ID_REQUIRED",
        severity: "error",
        message: "A stable Power identity is required before its Restriction can be saved.",
        path: "id",
      }]));
      continue;
    }

    const draft = drafts[id];
    if (!draft) {
      blocking.push(blockingIssue(power, powerIndex, "MISSING_DRAFT", [{
        code: "MONSTER_POWER_RESTRICTION_DRAFT_REQUIRED",
        severity: "error",
        message: "The transient Restriction draft is missing and must be reloaded before saving.",
        path: "restriction",
      }]));
      continue;
    }

    const resolution = resolveMonsterPowerRestrictionDraft(draft);
    if (resolution.status === "INCOMPLETE" || resolution.status === "INVALID") {
      blocking.push(blockingIssue(power, powerIndex, resolution.status, resolution.issues));
      continue;
    }

    const definition = resolution.status === "NONE" ? null : resolution.definition;
    const persistence = normalizeMonsterRestrictionForWrite(definition, {
      campaignId: context.campaignId,
    });
    if (!persistence.ok) {
      blocking.push(blockingIssue(power, powerIndex, "INVALID", persistence.issues));
      continue;
    }
    resolvedById.set(id, definition);
  }

  if (blocking.length > 0) {
    return { ok: false, monster: null, issues: blocking };
  }

  return {
    ok: true,
    monster: {
      ...source,
      powers: source.powers.map((power) => ({
        ...power,
        restriction: resolvedById.get(powerId(power)!) ?? null,
      })),
    },
    issues: [],
  };
}

export function getMonsterPowerRestrictionSummaryLabel(
  draft: RestrictionEditorDraft,
): string {
  const resolution = resolveMonsterPowerRestrictionDraft(draft);
  if (resolution.status === "NONE") return "No Restriction";
  if (resolution.status === "INCOMPLETE") return "Incomplete Restriction Draft";
  if (resolution.status === "INVALID") return "Invalid Restriction Draft";
  if (resolution.status === "CAMPAIGN_CUSTOM_READ_ONLY") return "Campaign-Custom Restriction";
  if (resolution.status === "UNSUPPORTED_READ_ONLY") return "Unsupported Restriction";
  return resolution.definition?.authoringMode === "CUSTOM_NARRATIVE"
    ? "Fully Custom Restriction"
    : "Standard Restriction";
}
