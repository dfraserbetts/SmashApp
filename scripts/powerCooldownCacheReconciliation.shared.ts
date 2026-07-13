import type { PowerCooldownAuthorityResult } from "../lib/summoning/types";

export const RECONCILIATION_SCHEMA_VERSION = "1.0.0" as const;
export const RECONCILIATION_MUTATION_SAFETY = "READ_ONLY" as const;
export const NO_WRITE_DECLARATION = "DRY RUN ONLY — no database, tuning, asset, or repository writes occurred.";

export type ReconciliationStatus = "MATCH" | "MISMATCH" | "UNRESOLVED";
export type ReconciliationCategory = "MONSTER_POWER" | "CHARACTER_POWER" | "SIGNATURE_MOVE";
export type ReconciliationScope = "MONSTER" | "CHARACTER";

export type ReconciliationResult = {
  category: ReconciliationCategory;
  powerId: string;
  powerName: string;
  ownerId: string;
  ownerName: string;
  campaignId: string | null;
  campaignName: string | null;
  ownerArchived: boolean;
  level: number;
  tier: string | null;
  storedCooldownTurns: number | null;
  storedCooldownReduction: number | null;
  derivedEffectiveCooldownTurns: number | null;
  targetCooldownTurns: number | null;
  targetCooldownReduction: number | null;
  cooldownDelta: number | null;
  status: ReconciliationStatus;
  authoritySource: string | null;
  tuningSetId: string | null;
  tuningUpdatedAt: string | null;
  mismatch: boolean | null;
  warnings: string[];
  error: string | null;
  proposedChangedPaths: string[];
  semanticIntegrityVerified: boolean;
};

export type ReconciliationCategoryCounts = {
  total: number;
  matches: number;
  mismatches: number;
  unresolved: number;
};

export type ReconciliationReport = {
  schemaVersion: typeof RECONCILIATION_SCHEMA_VERSION;
  scope: ReconciliationScope;
  generatedAt: string;
  branch: string;
  commitSha: string;
  tuning: {
    setId: string | null;
    name: string | null;
    updatedAt: string | null;
  };
  database: {
    access: "read-only";
    source: "DATABASE_URL";
    ownerCount: number;
  };
  provenance: {
    databaseAccess: "read-only";
    mutationSafety: typeof RECONCILIATION_MUTATION_SAFETY;
    tuningSetId: string | null;
    tuningUpdatedAt: string | null;
  };
  mutationSafety: typeof RECONCILIATION_MUTATION_SAFETY;
  total: number;
  matches: number;
  mismatches: number;
  unresolved: number;
  storedLowerThanDerived: number;
  storedHigherThanDerived: number;
  reductionOnlyChanges: number;
  activeOwnerCount: number;
  archivedOwnerCount: number;
  categoryCounts: Record<ReconciliationCategory, ReconciliationCategoryCounts>;
  results: ReconciliationResult[];
  warnings: string[];
  noWriteDeclaration: typeof NO_WRITE_DECLARATION;
};

export type DryRunCliOptions = { json: boolean; help: boolean };

export function parseDryRunCliArgs(args: readonly string[], toolName: string): DryRunCliOptions {
  let json = false;
  let help = false;
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--apply") {
      throw new Error(`${toolName} is dry-run only; --apply is forbidden and is not implemented.`);
    } else {
      throw new Error(`Unknown option for ${toolName}: ${arg}`);
    }
  }
  return { json, help };
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value), null, 2);
}

function deepChangedPaths(before: unknown, after: unknown, prefix = ""): string[] {
  if (stableJson(before) === stableJson(after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const paths: string[] = [];
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      const path = `${prefix}[${index}]`;
      paths.push(...deepChangedPaths(before[index], after[index], path));
    }
    return paths;
  }
  if (
    before && typeof before === "object" && !Array.isArray(before) &&
    after && typeof after === "object" && !Array.isArray(after)
  ) {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    return keys.flatMap((key) =>
      deepChangedPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix || "<root>"];
}

export function verifyCacheOnlyPowerChange(before: unknown, after: unknown): {
  ok: boolean;
  changedPaths: string[];
} {
  const changedPaths = deepChangedPaths(before, after);
  return {
    ok: changedPaths.every((path) => path === "cooldownTurns" || path === "cooldownReduction"),
    changedPaths,
  };
}

export function verifyBuilderDataCacheOnlyChanges(before: unknown, after: unknown): {
  ok: boolean;
  changedPaths: string[];
} {
  const changedPaths = deepChangedPaths(before, after);
  const allowed = /^(powers\[\d+\]|signatureMove)\.(cooldownTurns|cooldownReduction)$/;
  return { ok: changedPaths.every((path) => allowed.test(path)), changedPaths };
}

function finiteInteger(value: unknown): number | null {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

export function resolvedReconciliationResult(params: {
  category: ReconciliationCategory;
  powerId: string;
  powerName: string;
  ownerId: string;
  ownerName: string;
  campaignId: string | null;
  campaignName: string | null;
  ownerArchived: boolean;
  level: number;
  tier?: string | null;
  originalPower: Record<string, unknown>;
  targetCooldownTurns: number;
  authority: PowerCooldownAuthorityResult;
}): ReconciliationResult {
  const storedCooldownTurns = finiteInteger(params.originalPower.cooldownTurns);
  const storedCooldownReduction = finiteInteger(params.originalPower.cooldownReduction);
  const targetCooldownTurns = Math.max(1, Math.trunc(params.targetCooldownTurns));
  const proposedPower = {
    ...params.originalPower,
    cooldownTurns: targetCooldownTurns,
    cooldownReduction: 0,
  };
  const integrity = verifyCacheOnlyPowerChange(params.originalPower, proposedPower);
  const cacheMatches = storedCooldownTurns === targetCooldownTurns && storedCooldownReduction === 0;
  const integrityError = integrity.ok
    ? null
    : `Semantic integrity failure: proposed changes included ${integrity.changedPaths.join(", ")}.`;
  return {
    category: params.category,
    powerId: params.powerId,
    powerName: params.powerName,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    campaignId: params.campaignId,
    campaignName: params.campaignName,
    ownerArchived: params.ownerArchived,
    level: params.level,
    tier: params.tier ?? null,
    storedCooldownTurns,
    storedCooldownReduction,
    derivedEffectiveCooldownTurns: targetCooldownTurns,
    targetCooldownTurns,
    targetCooldownReduction: 0,
    cooldownDelta: storedCooldownTurns === null ? null : targetCooldownTurns - storedCooldownTurns,
    status: integrity.ok ? (cacheMatches ? "MATCH" : "MISMATCH") : "UNRESOLVED",
    authoritySource: params.authority.source,
    tuningSetId: params.authority.tuningSetId,
    tuningUpdatedAt: params.authority.tuningUpdatedAt,
    mismatch: !cacheMatches,
    warnings: [...params.authority.warnings],
    error: integrityError,
    proposedChangedPaths: integrity.changedPaths,
    semanticIntegrityVerified: integrity.ok,
  };
}

export function unresolvedReconciliationResult(params: {
  category: ReconciliationCategory;
  powerId: string;
  powerName: string;
  ownerId: string;
  ownerName: string;
  campaignId: string | null;
  campaignName: string | null;
  ownerArchived: boolean;
  level: number;
  tier?: string | null;
  storedCooldownTurns?: unknown;
  storedCooldownReduction?: unknown;
  error: string;
}): ReconciliationResult {
  return {
    category: params.category,
    powerId: params.powerId,
    powerName: params.powerName,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    campaignId: params.campaignId,
    campaignName: params.campaignName,
    ownerArchived: params.ownerArchived,
    level: params.level,
    tier: params.tier ?? null,
    storedCooldownTurns: finiteInteger(params.storedCooldownTurns),
    storedCooldownReduction: finiteInteger(params.storedCooldownReduction),
    derivedEffectiveCooldownTurns: null,
    targetCooldownTurns: null,
    targetCooldownReduction: null,
    cooldownDelta: null,
    status: "UNRESOLVED",
    authoritySource: null,
    tuningSetId: null,
    tuningUpdatedAt: null,
    mismatch: null,
    warnings: [],
    error: params.error,
    proposedChangedPaths: [],
    semanticIntegrityVerified: false,
  };
}

function categoryCounts(results: readonly ReconciliationResult[], category: ReconciliationCategory) {
  const rows = results.filter((result) => result.category === category);
  return {
    total: rows.length,
    matches: rows.filter((result) => result.status === "MATCH").length,
    mismatches: rows.filter((result) => result.status === "MISMATCH").length,
    unresolved: rows.filter((result) => result.status === "UNRESOLVED").length,
  };
}

export function createReconciliationReport(params: {
  scope: ReconciliationScope;
  generatedAt: string;
  branch: string;
  commitSha: string;
  tuning: ReconciliationReport["tuning"];
  ownerCount: number;
  activeOwnerCount: number;
  archivedOwnerCount: number;
  results: readonly ReconciliationResult[];
  warnings?: readonly string[];
}): ReconciliationReport {
  const results = [...params.results].sort((left, right) =>
    [left.category, left.campaignName ?? "", left.ownerName, left.powerName, left.powerId]
      .join("\u0000")
      .localeCompare([right.category, right.campaignName ?? "", right.ownerName, right.powerName, right.powerId].join("\u0000")),
  );
  return {
    schemaVersion: RECONCILIATION_SCHEMA_VERSION,
    scope: params.scope,
    generatedAt: params.generatedAt,
    branch: params.branch,
    commitSha: params.commitSha,
    tuning: params.tuning,
    database: { access: "read-only", source: "DATABASE_URL", ownerCount: params.ownerCount },
    provenance: {
      databaseAccess: "read-only",
      mutationSafety: RECONCILIATION_MUTATION_SAFETY,
      tuningSetId: params.tuning.setId,
      tuningUpdatedAt: params.tuning.updatedAt,
    },
    mutationSafety: RECONCILIATION_MUTATION_SAFETY,
    total: results.length,
    matches: results.filter((result) => result.status === "MATCH").length,
    mismatches: results.filter((result) => result.status === "MISMATCH").length,
    unresolved: results.filter((result) => result.status === "UNRESOLVED").length,
    storedLowerThanDerived: results.filter((result) =>
      result.status === "MISMATCH" && result.cooldownDelta !== null && result.cooldownDelta > 0,
    ).length,
    storedHigherThanDerived: results.filter((result) =>
      result.status === "MISMATCH" && result.cooldownDelta !== null && result.cooldownDelta < 0,
    ).length,
    reductionOnlyChanges: results.filter((result) =>
      result.status === "MISMATCH" &&
      result.cooldownDelta === 0 &&
      typeof result.storedCooldownReduction === "number" &&
      result.storedCooldownReduction !== 0,
    ).length,
    activeOwnerCount: params.activeOwnerCount,
    archivedOwnerCount: params.archivedOwnerCount,
    categoryCounts: {
      MONSTER_POWER: categoryCounts(results, "MONSTER_POWER"),
      CHARACTER_POWER: categoryCounts(results, "CHARACTER_POWER"),
      SIGNATURE_MOVE: categoryCounts(results, "SIGNATURE_MOVE"),
    },
    results,
    warnings: [...(params.warnings ?? [])],
    noWriteDeclaration: NO_WRITE_DECLARATION,
  };
}

export function reconciliationExitCode(report: ReconciliationReport): number {
  return report.unresolved > 0 ? 1 : 0;
}

export function formatReconciliationHuman(report: ReconciliationReport): string {
  const lines = [
    `Power Cooldown Cache Reconciliation — ${report.scope}`,
    `repository=${report.branch}@${report.commitSha}`,
    `tuning=${report.tuning.name ?? "missing"} (${report.tuning.setId ?? "none"}, ${report.tuning.updatedAt ?? "unknown"})`,
    `owners=${report.database.ownerCount} active=${report.activeOwnerCount} archived=${report.archivedOwnerCount}`,
    `total=${report.total} match=${report.matches} mismatch=${report.mismatches} unresolved=${report.unresolved}`,
    `storedLower=${report.storedLowerThanDerived} storedHigher=${report.storedHigherThanDerived} reductionOnly=${report.reductionOnlyChanges}`,
  ];
  for (const category of ["MONSTER_POWER", "CHARACTER_POWER", "SIGNATURE_MOVE"] as const) {
    const count = report.categoryCounts[category];
    if (count.total > 0) lines.push(`${category}: total=${count.total} match=${count.matches} mismatch=${count.mismatches} unresolved=${count.unresolved}`);
  }
  for (const row of report.results.filter((result) => result.status !== "MATCH")) {
    lines.push(
      `${row.status} ${row.category} ${row.ownerName} :: ${row.powerName} stored=${row.storedCooldownTurns}/${row.storedCooldownReduction} target=${row.targetCooldownTurns}/${row.targetCooldownReduction}${row.error ? ` error=${row.error}` : ""}`,
    );
  }
  lines.push(...report.warnings.map((warning) => `WARNING ${warning}`));
  lines.push(NO_WRITE_DECLARATION);
  return lines.join("\n");
}

export function formatDryRunHelp(toolName: string, description: string): string {
  return `${description}\n\nUsage: npx --yes tsx scripts/${toolName}.ts [--json|--help]\n\nThis command is permanently dry-run only. --apply and unknown options are rejected.`;
}
