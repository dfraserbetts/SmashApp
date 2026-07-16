import {
  normalizeRestrictionDefinition,
  validateRestrictionDefinition,
  type AbilityRestrictionDefinitionV1,
  type RestrictionIssue,
} from "@/lib/restrictions";
import {
  ROLEPLAY_RESTRICTION_BAND_VALUES,
  ROLEPLAY_RESTRICTION_TYPE_VALUES,
  type RoleplayRestrictionBand,
  type RoleplayRestrictionType,
} from "@/lib/characterBuilder/legacyRoleplayRestrictions";

export type PersistedRestrictionStatus = "NONE" | "VALID" | "UNSUPPORTED" | "INVALID";

export type PersistedRestrictionNormalizationResult = {
  definition: AbilityRestrictionDefinitionV1 | null;
  issues: RestrictionIssue[];
  status: PersistedRestrictionStatus;
  valid: boolean;
};

export function normalizePersistedRestriction(
  input: unknown,
): PersistedRestrictionNormalizationResult {
  if (input == null) {
    return { definition: null, issues: [], status: "NONE", valid: true };
  }

  try {
    const normalized = normalizeRestrictionDefinition(input);
    if (!normalized.definition) {
      return {
        definition: null,
        issues: normalized.issues,
        status: "INVALID",
        valid: false,
      };
    }

    const issues = [
      ...normalized.issues,
      ...validateRestrictionDefinition(normalized.definition),
    ];
    const errors = issues.filter((entry) => entry.severity === "error");
    if (errors.length === 0) {
      return { definition: normalized.definition, issues, status: "VALID", valid: true };
    }
    if (errors.every((entry) => entry.code === "UNKNOWN_TEMPLATE")) {
      return {
        definition: normalized.definition,
        issues,
        status: "UNSUPPORTED",
        valid: false,
      };
    }
    return { definition: null, issues, status: "INVALID", valid: false };
  } catch {
    return {
      definition: null,
      issues: [{
        code: "PERSISTED_RESTRICTION_NORMALIZATION_FAILED",
        severity: "error",
        message: "The persisted Restriction could not be normalized safely.",
        path: "restriction",
      }],
      status: "INVALID",
      valid: false,
    };
  }
}

export const LEGACY_ROLEPLAY_RESTRICTION_TYPES = ROLEPLAY_RESTRICTION_TYPE_VALUES;
export type LegacyRoleplayRestrictionType = RoleplayRestrictionType;

export const LEGACY_ROLEPLAY_RESTRICTION_BANDS = ROLEPLAY_RESTRICTION_BAND_VALUES;
export type LegacyRoleplayRestrictionBand = RoleplayRestrictionBand;

export type LegacyRoleplayRestrictionSource = {
  restrictionType: LegacyRoleplayRestrictionType;
  restrictionBand: LegacyRoleplayRestrictionBand;
  restrictionTag: string;
  restrictionText: string;
};

export type LegacyRoleplayRestrictionMigrationResult = {
  definition: AbilityRestrictionDefinitionV1 | null;
  issues: RestrictionIssue[];
  migrationApplied: boolean;
  legacySource: LegacyRoleplayRestrictionSource;
};

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ").slice(0, maximum) : "";
}

function option<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && options.includes(value as T) ? value as T : fallback;
}

export function normalizeLegacyRoleplayRestrictionSource(
  input: unknown,
): LegacyRoleplayRestrictionSource {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    restrictionType: option(
      record.restrictionType,
      LEGACY_ROLEPLAY_RESTRICTION_TYPES,
      "NONE",
    ),
    restrictionBand: option(
      record.restrictionBand,
      LEGACY_ROLEPLAY_RESTRICTION_BANDS,
      "NONE_COSMETIC",
    ),
    restrictionTag: text(record.restrictionTag, 120),
    restrictionText: text(record.restrictionText, 1000),
  };
}

export function diagnoseRoleplayRestrictionTransition(input: unknown): RestrictionIssue[] {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const legacy = normalizeLegacyRoleplayRestrictionSource(record);
  return legacy.restrictionType !== "NONE" && record.restriction != null
    ? [{
        code: "LEGACY_AND_SHARED_RESTRICTION_PRESENT",
        severity: "warning",
        message: "Legacy and shared Roleplay Restriction representations are both present; neither is selected as authoritative during the transition.",
        path: "restriction",
      }]
    : [];
}

function customNarrative(textValue: string): AbilityRestrictionDefinitionV1 {
  return {
    schemaVersion: 1,
    authoringMode: "CUSTOM_NARRATIVE",
    templateKey: null,
    templateVersion: null,
    parameters: {},
    customNarrativeText: textValue,
  };
}

export function isLegacyCircumstanceEligibleForAutomaticMigration(
  value: string,
): boolean {
  const normalized = text(value, 1000);
  if (!/[.!?]$/u.test(normalized)) return false;
  const condition = normalized.replace(/[.!?]+$/u, "").trim();
  return (
    /^this ability may only\b\s+\S/iu.test(condition) ||
    /^only\s+(?:while|when|after|before|if)\b\s+\S/iu.test(condition)
  );
}

export function migrateLegacyRoleplayRestriction(
  input: unknown,
): LegacyRoleplayRestrictionMigrationResult {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const legacySource = normalizeLegacyRoleplayRestrictionSource(record);
  const shared = normalizePersistedRestriction(record.restriction);
  const issues = [...shared.issues, ...diagnoseRoleplayRestrictionTransition(record)];

  if (record.restriction != null) {
    if (!shared.definition) {
      issues.push({
        code: "LEGACY_MIGRATION_BLOCKED_BY_INVALID_SHARED_RESTRICTION",
        severity: "warning",
        message: "Legacy migration did not overwrite the existing malformed shared Restriction.",
        path: "restriction",
      });
    }
    return {
      definition: shared.definition,
      issues,
      migrationApplied: false,
      legacySource,
    };
  }

  if (legacySource.restrictionType === "NONE") {
    return { definition: null, issues, migrationApplied: true, legacySource };
  }

  let narrative: string | null = null;
  if (legacySource.restrictionType === "TARGET_ELIGIBILITY") {
    if (legacySource.restrictionTag) {
      narrative = `This Ability may only target ${legacySource.restrictionTag}.`;
    } else {
      issues.push({
        code: "BLANK_LEGACY_RESTRICTION_TAG",
        severity: "warning",
        message: "Target Eligibility has no target phrase and requires review.",
        path: "restrictionTag",
      });
    }
  } else if (
    legacySource.restrictionType === "CIRCUMSTANCE" &&
    isLegacyCircumstanceEligibleForAutomaticMigration(legacySource.restrictionText)
  ) {
    narrative = legacySource.restrictionText;
  }

  if (!narrative) {
    issues.push({
      code: "LEGACY_RESTRICTION_REQUIRES_REVIEW",
      severity: "warning",
      message: "The legacy Restriction cannot be migrated unambiguously and requires review.",
      path: "restrictionType",
    });
    return { definition: null, issues, migrationApplied: false, legacySource };
  }

  const migrated = normalizePersistedRestriction(customNarrative(narrative));
  return {
    definition: migrated.definition,
    issues: [...issues, ...migrated.issues],
    migrationApplied: migrated.status === "VALID",
    legacySource,
  };
}
