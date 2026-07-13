import {
  APPLY_CONFIRMATION_TOKEN,
  type DryRunCliOptions,
  type ReconciliationReport,
  type ReconciliationScope,
} from "./powerCooldownCacheReconciliation.shared";

export type ApplyTransactionStatus = "COMMITTED" | "ROLLED_BACK";

export type ApplyTransactionEvidence = {
  attemptedChangeCount: number;
  appliedChangeCount: number;
  affectedOwnerCount: number;
  preVerificationResult: boolean;
  postVerificationResult: boolean;
  unchangedSemanticIntegrityResult: boolean;
  warnings?: readonly string[];
};

export type ReconciliationApplyResult = {
  scope: ReconciliationScope;
  mode: "APPLY";
  planHash: string;
  tuning: ReconciliationReport["tuning"];
  attemptedChangeCount: number;
  appliedChangeCount: number;
  affectedOwnerCount: number;
  transactionStatus: ApplyTransactionStatus;
  preVerificationResult: boolean;
  postVerificationResult: boolean;
  unchangedSemanticIntegrityResult: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  warnings: string[];
  errors: string[];
};

const allowedPowerPath = /^(cooldownTurns|cooldownReduction)$/;
const allowedBuilderPath = /^(powers\[\d+\]|signatureMove)\.(cooldownTurns|cooldownReduction)$/;

export function assertApplyPreconditions(params: {
  options: DryRunCliOptions;
  report: ReconciliationReport;
}): void {
  const { options, report } = params;
  if (!options.apply) throw new Error("Apply preconditions require --apply.");
  if (options.confirm !== APPLY_CONFIRMATION_TOKEN) {
    throw new Error(`Apply confirmation must exactly equal ${APPLY_CONFIRMATION_TOKEN}.`);
  }
  if (!options.planHash) throw new Error("Apply requires a supplied plan hash.");
  if (options.planHash !== report.planHash) {
    throw new Error(`Plan hash mismatch: supplied ${options.planHash}, current ${report.planHash}.`);
  }
  if (!report.tuning.setId || !report.tuning.updatedAt) {
    throw new Error("Apply requires active tuning provenance.");
  }
  if (report.unresolved > 0) throw new Error("Apply is forbidden while any reconciliation row is UNRESOLVED.");
  if (report.mismatches === 0) throw new Error("Apply is forbidden when the current plan has zero mismatches.");
  const allowed = report.scope === "MONSTER" ? allowedPowerPath : allowedBuilderPath;
  for (const row of report.results) {
    if (!row.semanticIntegrityVerified) {
      throw new Error(`Semantic integrity is not verified for ${row.ownerId}/${row.powerId}.`);
    }
    if (row.proposedChangedPaths.some((path) => !allowed.test(path))) {
      throw new Error(`Apply plan contains a forbidden changed path for ${row.ownerId}/${row.powerId}.`);
    }
  }
}

export async function executeGuardedApply(params: {
  options: DryRunCliOptions;
  report: ReconciliationReport;
  preTransactionVerify?: () => Promise<void>;
  transaction: () => Promise<ApplyTransactionEvidence>;
  now?: () => Date;
}): Promise<ReconciliationApplyResult> {
  assertApplyPreconditions(params);
  await params.preTransactionVerify?.();
  const now = params.now ?? (() => new Date());
  const started = now();
  const attemptedChangeCount = params.report.mismatches;
  try {
    const evidence = await params.transaction();
    if (
      evidence.attemptedChangeCount !== attemptedChangeCount ||
      evidence.appliedChangeCount !== attemptedChangeCount ||
      !evidence.preVerificationResult ||
      !evidence.postVerificationResult ||
      !evidence.unchangedSemanticIntegrityResult
    ) {
      throw new Error("Transaction evidence did not verify the complete reconciliation plan.");
    }
    const ended = now();
    return {
      scope: params.report.scope,
      mode: "APPLY",
      planHash: params.report.planHash,
      tuning: params.report.tuning,
      attemptedChangeCount,
      appliedChangeCount: evidence.appliedChangeCount,
      affectedOwnerCount: evidence.affectedOwnerCount,
      transactionStatus: "COMMITTED",
      preVerificationResult: true,
      postVerificationResult: true,
      unchangedSemanticIntegrityResult: true,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationMs: Math.max(0, ended.getTime() - started.getTime()),
      warnings: [...(evidence.warnings ?? [])],
      errors: [],
    };
  } catch (error) {
    const ended = now();
    return {
      scope: params.report.scope,
      mode: "APPLY",
      planHash: params.report.planHash,
      tuning: params.report.tuning,
      attemptedChangeCount,
      appliedChangeCount: 0,
      affectedOwnerCount: 0,
      transactionStatus: "ROLLED_BACK",
      preVerificationResult: false,
      postVerificationResult: false,
      unchangedSemanticIntegrityResult: false,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationMs: Math.max(0, ended.getTime() - started.getTime()),
      warnings: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function formatApplyHuman(result: ReconciliationApplyResult): string {
  return [
    `Power Cooldown Cache Reconciliation — ${result.scope} — APPLY MODE`,
    `planHash=${result.planHash}`,
    `transaction=${result.transactionStatus}`,
    `attempted=${result.attemptedChangeCount} applied=${result.appliedChangeCount} owners=${result.affectedOwnerCount}`,
    `preVerified=${result.preVerificationResult} postVerified=${result.postVerificationResult}`,
    `semanticFieldsUnchanged=${result.unchangedSemanticIntegrityResult}`,
    result.transactionStatus === "COMMITTED"
      ? `${result.appliedChangeCount} cache entries changed; no semantic fields changed; transaction committed.`
      : "No cache entries changed; transaction rolled back.",
    ...result.warnings.map((warning) => `WARNING ${warning}`),
    ...result.errors.map((error) => `ERROR ${error}`),
  ].join("\n");
}
