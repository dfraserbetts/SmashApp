import type { Prisma } from "@prisma/client";
import {
  validateRestrictionDefinition,
  type AbilityRestrictionDefinitionV1,
  type RestrictionIssue,
} from "@/lib/restrictions";
import {
  normalizePersistedRestriction,
  type PersistedRestrictionNormalizationResult,
} from "@/lib/restrictions/persistence";

export type MonsterRestrictionPersistenceContext = {
  campaignId: string | null;
};

export type MonsterRestrictionWriteResult =
  | {
      ok: true;
      definition: AbilityRestrictionDefinitionV1 | null;
      issues: RestrictionIssue[];
      status: "NONE" | "VALID" | "UNSUPPORTED";
    }
  | {
      ok: false;
      definition: null;
      issues: RestrictionIssue[];
      status: "INVALID";
    };

function issueIdentity(entry: RestrictionIssue): string {
  return `${entry.code}:${entry.path ?? ""}`;
}

function isPrismaNullSentinel(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const name = Object.getPrototypeOf(input)?.constructor?.name;
  return Object.keys(input).length === 0 && (name === "DbNull" || name === "JsonNull");
}

function uniqueIssues(issues: readonly RestrictionIssue[]): RestrictionIssue[] {
  const seen = new Set<string>();
  return issues.filter((entry) => {
    const identity = issueIdentity(entry);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function campaignReferenceIssues(
  definition: AbilityRestrictionDefinitionV1,
  context: MonsterRestrictionPersistenceContext,
): RestrictionIssue[] {
  const issues: RestrictionIssue[] = [];
  for (const [key, value] of Object.entries(definition.parameters)) {
    if (value.kind !== "CAMPAIGN_REFERENCE") continue;
    const path = `parameters.${key}`;
    if (!context.campaignId) {
      issues.push({
        code: "CAMPAIGN_REFERENCE_REQUIRES_CAMPAIGN_MONSTER",
        severity: "error",
        message: "Campaign references cannot be saved on global or core Monster Powers.",
        path,
      });
    } else if (value.campaignId !== context.campaignId) {
      issues.push({
        code: "CROSS_CAMPAIGN_REFERENCE",
        severity: "error",
        message: "Campaign references must belong to the Monster campaign.",
        path,
      });
    }
  }
  return issues;
}

export function readMonsterRestrictionFromDatabase(
  input: unknown,
): PersistedRestrictionNormalizationResult {
  return normalizePersistedRestriction(isPrismaNullSentinel(input) ? null : input);
}

export function normalizeMonsterRestrictionForWrite(
  input: unknown,
  context: MonsterRestrictionPersistenceContext,
): MonsterRestrictionWriteResult {
  const persisted = normalizePersistedRestriction(isPrismaNullSentinel(input) ? null : input);
  if (persisted.status === "NONE") {
    return { ok: true, definition: null, issues: [], status: "NONE" };
  }
  if (!persisted.definition || persisted.status === "INVALID") {
    return {
      ok: false,
      definition: null,
      issues: persisted.issues,
      status: "INVALID",
    };
  }

  const unsupported = persisted.status === "UNSUPPORTED";
  const normalizedIssues = persisted.issues.map((entry) =>
    unsupported && entry.code === "UNKNOWN_TEMPLATE"
      ? { ...entry, severity: "warning" as const }
      : entry,
  );
  const validationIssues = unsupported
    ? []
    : validateRestrictionDefinition(
        persisted.definition,
        context.campaignId ? { campaignId: context.campaignId } : undefined,
      );
  const issues = uniqueIssues([
    ...normalizedIssues,
    ...validationIssues,
    ...campaignReferenceIssues(persisted.definition, context),
  ]);
  if (issues.some((entry) => entry.severity === "error")) {
    return { ok: false, definition: null, issues, status: "INVALID" };
  }
  return {
    ok: true,
    definition: persisted.definition,
    issues,
    status: unsupported ? "UNSUPPORTED" : "VALID",
  };
}

export function serializeMonsterRestrictionForDatabase<TDatabaseNull>(
  definition: AbilityRestrictionDefinitionV1 | null | undefined,
  databaseNull: TDatabaseNull,
): Prisma.InputJsonValue | TDatabaseNull {
  if (!definition) return databaseNull;
  return JSON.parse(JSON.stringify(definition)) as Prisma.InputJsonValue;
}
