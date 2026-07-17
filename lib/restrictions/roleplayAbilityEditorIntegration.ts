import type { CharacterBuilderData } from "@/lib/characterBuilder/core";
import type { RoleplayAbility } from "@/lib/characterBuilder/roleplayAbilities";
import {
  LEGACY_ROLEPLAY_RESTRICTION_BANDS,
  LEGACY_ROLEPLAY_RESTRICTION_TYPES,
  migrateLegacyRoleplayRestriction,
  normalizeLegacyRoleplayRestrictionSource,
  type LegacyRoleplayRestrictionSource,
} from "@/lib/restrictions/persistence";
import {
  normalizeRestrictionDefinition,
  validateRestrictionDefinition,
  type AbilityRestrictionDefinitionV1,
  type RestrictionIssue,
} from "@/lib/restrictions";
import {
  createRestrictionDraftFromDefinition,
  resolveRestrictionEditorDraft,
  selectRestrictionAuthoringChoice,
  type RestrictionDraftResolution,
  type RestrictionDraftResolutionStatus,
  type RestrictionEditorAuthoringChoice,
  type RestrictionEditorDraft,
} from "@/lib/restrictions/editorModel";

export type RoleplayAbilityRestrictionEditorState =
  | { kind: "EDITOR"; draft: RestrictionEditorDraft }
  | {
      kind: "LEGACY_REVIEW_REQUIRED";
      legacySource: LegacyRoleplayRestrictionSource;
      issues: RestrictionIssue[];
    };

export type RoleplayAbilityRestrictionStateMap = Record<
  string,
  RoleplayAbilityRestrictionEditorState
>;

export type RoleplayAbilityRestrictionBlockingIssue = {
  abilityIndex: number;
  abilityId: string;
  abilityName: string;
  resolutionStatus:
    | RestrictionDraftResolutionStatus
    | "LEGACY_REVIEW_REQUIRED"
    | "MISSING_STATE"
    | "MISSING_ABILITY_ID";
  issueCodes: string[];
  issueMessages: string[];
  message: string;
};

export type RoleplayAbilityRestrictionMaterializationResult =
  | { ok: true; builderData: CharacterBuilderData; issues: [] }
  | { ok: false; builderData: null; issues: RoleplayAbilityRestrictionBlockingIssue[] };

export type RoleplayAbilityRestrictionWriteIssue = {
  abilityIndex: number;
  abilityId: string | null;
  abilityName: string;
  code: string;
  message: string;
  clientMessage: string;
};

export const NEUTRAL_ROLEPLAY_RESTRICTION_LEGACY_FIELDS = {
  restrictionType: "NONE",
  restrictionBand: "NONE_COSMETIC",
  restrictionTag: "",
  restrictionText: "",
} as const;

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function abilityId(ability: Pick<RoleplayAbility, "id">): string | null {
  const id = ability.id?.trim();
  return id || null;
}

function abilityName(ability: Pick<RoleplayAbility, "name">, index: number): string {
  return ability.name?.trim() || `Roleplay Ability ${index + 1}`;
}

function stateFromAbility(ability: RoleplayAbility): RoleplayAbilityRestrictionEditorState {
  const migration = migrateLegacyRoleplayRestriction(ability);
  if (!migration.migrationApplied && !migration.definition) {
    const legacy = migration.legacySource;
    if (
      legacy.restrictionType !== "NONE"
      || legacy.restrictionBand !== "NONE_COSMETIC"
      || legacy.restrictionTag !== ""
      || legacy.restrictionText !== ""
    ) {
      return {
        kind: "LEGACY_REVIEW_REQUIRED",
        legacySource: legacy,
        issues: migration.issues,
      };
    }
  }
  return {
    kind: "EDITOR",
    draft: createRestrictionDraftFromDefinition(migration.definition),
  };
}

export function getRoleplayAbilityRestrictionStateKey(
  ability: Pick<RoleplayAbility, "id">,
): string | null {
  return abilityId(ability);
}

export function initializeRoleplayAbilityRestrictionStates(
  builderData: CharacterBuilderData,
): RoleplayAbilityRestrictionStateMap {
  const states: RoleplayAbilityRestrictionStateMap = {};
  for (const ability of builderData.roleplayAbilities) {
    const id = abilityId(ability);
    if (id) states[id] = stateFromAbility(ability);
  }
  return states;
}

export function reconcileRoleplayAbilityRestrictionStates(
  current: RoleplayAbilityRestrictionStateMap,
  builderData: CharacterBuilderData,
): RoleplayAbilityRestrictionStateMap {
  const next: RoleplayAbilityRestrictionStateMap = {};
  for (const ability of builderData.roleplayAbilities) {
    const id = abilityId(ability);
    if (id) next[id] = current[id] ?? stateFromAbility(ability);
  }
  return next;
}

export function rehydrateRoleplayAbilityRestrictionStates(
  authoritativeBuilderData: CharacterBuilderData,
): RoleplayAbilityRestrictionStateMap {
  return initializeRoleplayAbilityRestrictionStates(authoritativeBuilderData);
}

export function replaceLegacyRoleplayRestrictionReview(
  state: RoleplayAbilityRestrictionEditorState,
  choice: RestrictionEditorAuthoringChoice,
): RoleplayAbilityRestrictionEditorState {
  if (state.kind !== "LEGACY_REVIEW_REQUIRED") return state;
  return {
    kind: "EDITOR",
    draft: selectRestrictionAuthoringChoice({ kind: "NONE" }, choice),
  };
}

export function resolveRoleplayAbilityRestrictionState(
  state: RoleplayAbilityRestrictionEditorState,
): RestrictionDraftResolution | null {
  if (state.kind === "LEGACY_REVIEW_REQUIRED") return null;
  return resolveRestrictionEditorDraft(state.draft, { consumerNoun: "Ability" });
}

function blockingIssue(
  ability: RoleplayAbility,
  index: number,
  status: RoleplayAbilityRestrictionBlockingIssue["resolutionStatus"],
  issues: readonly RestrictionIssue[],
): RoleplayAbilityRestrictionBlockingIssue {
  const id = abilityId(ability) ?? "missing-roleplay-ability-id";
  const name = abilityName(ability, index);
  const issueCodes = issues.map((issue) => issue.code);
  const issueMessages = issues.map((issue) => issue.message);
  const detail = issueMessages.length > 0
    ? issueMessages.join(" ")
    : "The Restriction state cannot be saved.";
  return {
    abilityIndex: index,
    abilityId: id,
    abilityName: name,
    resolutionStatus: status,
    issueCodes,
    issueMessages,
    message: `Roleplay Ability ${index + 1} "${name}": ${detail}`,
  };
}

function firstCampaignIssue(
  definition: AbilityRestrictionDefinitionV1,
  campaignId?: string,
): RestrictionIssue | null {
  if (!campaignId) return null;
  for (const [key, value] of Object.entries(definition.parameters)) {
    if (value.kind === "CAMPAIGN_REFERENCE" && value.campaignId !== campaignId) {
      return {
        code: "CROSS_CAMPAIGN_REFERENCE",
        severity: "error",
        message: "Campaign references must belong to the active campaign.",
        path: `parameters.${key}`,
      };
    }
  }
  return null;
}

function materializedDefinition(
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

export function materializeRoleplayAbilityRestrictionStates(
  source: CharacterBuilderData,
  states: RoleplayAbilityRestrictionStateMap,
  campaignId?: string,
): RoleplayAbilityRestrictionMaterializationResult {
  const blocking: RoleplayAbilityRestrictionBlockingIssue[] = [];
  const definitions = new Map<string, AbilityRestrictionDefinitionV1 | null>();

  source.roleplayAbilities.forEach((ability, index) => {
    const id = abilityId(ability);
    if (!id) {
      blocking.push(blockingIssue(ability, index, "MISSING_ABILITY_ID", [{
        code: "ROLEPLAY_ABILITY_ID_REQUIRED",
        severity: "error",
        message: "A stable Roleplay Ability identity is required before its Restriction can be saved.",
        path: "id",
      }]));
      return;
    }
    const state = states[id];
    if (!state) {
      blocking.push(blockingIssue(ability, index, "MISSING_STATE", [{
        code: "ROLEPLAY_RESTRICTION_STATE_REQUIRED",
        severity: "error",
        message: "The transient Roleplay Restriction state is missing and must be reloaded before saving.",
        path: "restriction",
      }]));
      return;
    }
    if (state.kind === "LEGACY_REVIEW_REQUIRED") {
      blocking.push(blockingIssue(ability, index, "LEGACY_REVIEW_REQUIRED", state.issues));
      return;
    }
    const resolution = resolveRoleplayAbilityRestrictionState(state)!;
    if (resolution.status === "INCOMPLETE" || resolution.status === "INVALID") {
      blocking.push(blockingIssue(ability, index, resolution.status, resolution.issues));
      return;
    }
    if (resolution.definition) {
      const campaignIssue = firstCampaignIssue(resolution.definition, campaignId);
      if (campaignIssue) {
        blocking.push(blockingIssue(ability, index, "INVALID", [campaignIssue]));
        return;
      }
    }
    definitions.set(id, materializedDefinition(resolution));
  });

  if (blocking.length > 0) return { ok: false, builderData: null, issues: blocking };

  return {
    ok: true,
    builderData: {
      ...source,
      roleplayAbilities: source.roleplayAbilities.map((ability) => ({
        ...ability,
        restriction: definitions.get(abilityId(ability)!) ?? null,
        ...NEUTRAL_ROLEPLAY_RESTRICTION_LEGACY_FIELDS,
      })),
    },
    issues: [],
  };
}

export function getRoleplayAbilityRestrictionSummaryLabel(
  state: RoleplayAbilityRestrictionEditorState | undefined,
): string {
  if (!state) return "Invalid Restriction Draft";
  if (state.kind === "LEGACY_REVIEW_REQUIRED") return "Legacy Restriction Review Required";
  const resolution = resolveRoleplayAbilityRestrictionState(state)!;
  if (resolution.status === "NONE") return "No Restriction";
  if (resolution.status === "INCOMPLETE") return "Incomplete Restriction Draft";
  if (resolution.status === "INVALID") return "Invalid Restriction Draft";
  if (resolution.status === "CAMPAIGN_CUSTOM_READ_ONLY") return "Campaign-Custom Restriction";
  if (resolution.status === "UNSUPPORTED_READ_ONLY") return "Unsupported Restriction";
  return resolution.definition?.authoringMode === "CUSTOM_NARRATIVE"
    ? "Fully Custom Restriction"
    : "Standard Restriction";
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
  const campaignIssue = firstCampaignIssue(normalized.definition, campaignId);
  if (campaignIssue) return campaignIssue;
  const errors = validateRestrictionDefinition(
    normalized.definition,
    { campaignId },
  ).filter((issue) => issue.severity === "error");
  if (errors.length === 0 || errors.every((issue) => issue.code === "UNKNOWN_TEMPLATE")) {
    return null;
  }
  return errors[0];
}

function validateRawLegacyFields(ability: Record<string, unknown>): RestrictionIssue | null {
  const checks: Array<{
    key: keyof LegacyRoleplayRestrictionSource;
    valid: (value: unknown) => boolean;
  }> = [
    {
      key: "restrictionType",
      valid: (value) => typeof value === "string"
        && LEGACY_ROLEPLAY_RESTRICTION_TYPES.includes(
          value as (typeof LEGACY_ROLEPLAY_RESTRICTION_TYPES)[number],
        ),
    },
    {
      key: "restrictionBand",
      valid: (value) => typeof value === "string"
        && LEGACY_ROLEPLAY_RESTRICTION_BANDS.includes(
          value as (typeof LEGACY_ROLEPLAY_RESTRICTION_BANDS)[number],
        ),
    },
    { key: "restrictionTag", valid: (value) => typeof value === "string" },
    { key: "restrictionText", valid: (value) => typeof value === "string" },
  ];
  for (const check of checks) {
    if (!Object.prototype.hasOwnProperty.call(ability, check.key)) continue;
    if (!check.valid(ability[check.key])) {
      return {
        code: "MALFORMED_LEGACY_ROLEPLAY_RESTRICTION",
        severity: "error",
        message: `Legacy ${check.key} has an invalid value type or option.`,
        path: check.key,
      };
    }
  }
  return null;
}

function isNeutralLegacySource(source: LegacyRoleplayRestrictionSource): boolean {
  return source.restrictionType === "NONE"
    && source.restrictionBand === "NONE_COSMETIC"
    && source.restrictionTag === ""
    && source.restrictionText === "";
}

export function validateRawRoleplayAbilityRestrictionWrite(
  builderData: unknown,
  campaignId: string,
): RoleplayAbilityRestrictionWriteIssue | null {
  const rawBuilderData = readRecord(builderData);
  if (!Array.isArray(rawBuilderData.roleplayAbilities)) return null;

  for (let abilityIndex = 0; abilityIndex < rawBuilderData.roleplayAbilities.length; abilityIndex += 1) {
    const ability = readRecord(rawBuilderData.roleplayAbilities[abilityIndex]);
    const id = typeof ability.id === "string" && ability.id.trim() ? ability.id.trim() : null;
    const submittedName = typeof ability.name === "string" ? ability.name.trim() : "";
    const name = submittedName || `Roleplay Ability ${abilityIndex + 1}`;
    const legacyShapeIssue = validateRawLegacyFields(ability);
    const legacySource = normalizeLegacyRoleplayRestrictionSource(ability);
    const hasSemantic = Object.prototype.hasOwnProperty.call(ability, "restriction")
      && ability.restriction != null;
    let issue = legacyShapeIssue;
    if (!issue && !isNeutralLegacySource(legacySource)) {
      issue = {
        code: hasSemantic
          ? "ROLEPLAY_RESTRICTION_DUAL_WRITE"
          : "LEGACY_ROLEPLAY_RESTRICTION_WRITE_REJECTED",
        severity: "error",
        message: hasSemantic
          ? "Roleplay Restriction writes cannot combine the shared semantic definition with non-neutral legacy fields."
          : "Legacy Roleplay Restriction fields are no longer an accepted write authority.",
        path: hasSemantic ? "restriction" : "restrictionType",
      };
    }
    if (!issue && hasSemantic) issue = validateRawRestriction(ability.restriction, campaignId);
    if (!issue) continue;
    return {
      abilityIndex,
      abilityId: id,
      abilityName: name,
      code: issue.code,
      message: issue.message,
      clientMessage: `Roleplay Ability ${abilityIndex + 1} "${name}" Restriction [${issue.code}]: ${issue.message}`,
    };
  }
  return null;
}
