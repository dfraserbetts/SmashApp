# Balance Benchmark Contract

This document specifies the next automation pass. It does not implement a runner. Accepted baseline changes are governed by the [Balance Ledger](./balance-ledger.md#decision-log), and anomalous results follow [Balance Issue Escalation](./balance-issue-escalation.md).

## Goals

The future runner must:

- execute accepted benchmark suites consistently;
- be read-only and never run seeders, mutating helpers, or asset/tuning writers;
- use deterministic seeds for runtime evidence;
- support concise human output and structured JSON output;
- report commit, branch, tuning, database/campaign, command, and seed provenance;
- distinguish baseline drift from command failure;
- compare observations against explicit accepted references;
- never mutate database data, tuning rows, baselines, or assets.

## Compatibility Status

- `AVAILABLE` — usable by the runner without authority or provenance repair.
- `AVAILABLE_BUT_INCOMPATIBLE` — a script exists but violates a current contract.
- `PARTIAL` — some invariant coverage exists, but the dedicated accepted benchmark is incomplete or incompatible.
- `MISSING` — no current script provides meaningful coverage.

## Required Benchmark Families

| # | Family | Current scripts | Status | Contract note |
|---:|---|---|---|---|
| 1 | Core resolver and cooldown authority | `scripts/powerCostResolver.smoke.ts`; `scripts/powerCooldownAuthority.smoke.ts`; `scripts/powerThreatMonotonic.smoke.ts` | `AVAILABLE` | Pure/synthetic invariant coverage; no DB mutation. |
| 2 | Combat Lab runtime | `scripts/combatLab.smoke.ts`; `scripts/combatLab.partyBossContextRead.ts`; `scripts/combatLab.legendaryEliteBenchmarkMatrix.ts`; `scripts/combatLab.scenarioMatrix.ts` | `AVAILABLE` | Reporters already support deterministic seeds; the principal Level 3 reporters support `--json`. DB-backed reporters must declare read-only provenance. |
| 3 | Character Builder powers | `scripts/characterPowerBuilder.smoke.ts` | `AVAILABLE` | Covers budget, costing, cooldown pressure, and explicit preview/current-authority behaviour. |
| 4 | Outcome Calculator smoke | `scripts/monsterOutcomeCalculator.smoke.ts` | `AVAILABLE` | Contains hard invariants and accepted axis anchors. |
| 5 | Threat reconciliation | `scripts/balanceAudit.summoningCircleAxisReconciliation.ts`; `scripts/powerThreatMonotonic.smoke.ts` | `PARTIAL` | Monotonic smoke is usable. The DB reconciliation script still invokes built-in power defaults and does not attach centralized cooldown authority, so its power-axis output is incompatible until migrated. |
| 6 | Durability reconciliation | `scripts/balanceAudit.summoningCircleDurabilityAxisReconciliation.ts`; durability anchors in `scripts/monsterOutcomeCalculator.smoke.ts` | `PARTIAL` | Hard anchors are usable. The dedicated DB audit loads active tuning but does not attach cooldown authority to power contributions. |
| 7 | Pressure reconciliation | `scripts/balanceAudit.summoningCircleRemainingAxisReconciliation.ts`; Pressure anchors in `scripts/monsterOutcomeCalculator.smoke.ts` | `PARTIAL` | Smoke anchors are usable. The DB audit lacks centralized cooldown-authority attachment for power packages. |
| 8 | Control Pressure reconciliation | `scripts/balanceAudit.summoningCircleControlPressureReconciliation.ts`; Control Pressure anchors in `scripts/monsterOutcomeCalculator.smoke.ts` | `PARTIAL` | Semantic smoke is usable. The DB audit needs the same authority migration before becoming an accepted runner suite. |
| 9 | Shared success-scaled effect grids | `scripts/balanceAudit.atomicAttackCostGrid.ts`; `scripts/balanceAudit.controlDebuffAtomicCostGrid.ts`; `scripts/balanceAudit.secondaryRiderCostGrid.ts`; `scripts/balanceAudit.forgeStrengthCostGrid.ts`; `scripts/balanceAudit.forgeBudgetCurve.ts` | `AVAILABLE` | Read-only static scan; current power grids supply the active tuning snapshot. Broader family coverage remains an ordered future audit. |
| 10 | Synergy reconciliation | `scripts/balanceAudit.summoningCircleSynergyReconciliation.ts` | `AVAILABLE_BUT_INCOMPATIBLE` | Untracked helper. Its raw `adaptPowerToCombatActions(power)` call at line 347 is rejected by centralized cooldown authority, and calculator contributions are not authority-attached. Do not run it as accepted evidence until migrated. |
| 11 | Future Mobility reconciliation | Mobility output in `scripts/balanceAudit.summoningCircleRemainingAxisReconciliation.ts` | `PARTIAL` | An inventory view exists, but the shared script has the authority incompatibility above and there is no accepted Mobility calibration suite. |

All `balanceAudit.*` files currently appear read-only by static mutation-call scan. The runner must still enforce and report mutation safety rather than trusting naming.

## Standard Result Schema

Every suite returns one result object in JSON mode:

```ts
type BalanceBenchmarkResult = {
  suiteId: string;
  status: "PASS" | "BLOCKER" | "REGRESSION" | "WARNING" | "INFORMATIONAL" | "SKIPPED_INCOMPATIBLE";
  command: string;
  startedAt: string;
  endedAt: string;
  commitSha: string;
  branch: string;
  tuning: {
    power?: { setId: string; updatedAt: string };
    combat?: { setId: string; updatedAt: string };
    outcomeNormalization?: { setId: string; updatedAt: string };
  };
  dataProvenance?: {
    databaseAccess: "none" | "read-only";
    campaignId?: string;
    campaignName?: string;
    assetSource?: string;
  };
  deterministicSeeds: number[];
  baselines: Record<string, unknown>;
  observed: Record<string, unknown>;
  tolerances: Record<string, number | string>;
  warnings: string[];
  changedAxes: string[];
  mutationSafety: {
    declaredReadOnly: boolean;
    databaseWrites: false;
    assetWrites: false;
    tuningWrites: false;
  };
  errorOutput?: string;
};
```

Command failure and baseline drift are separate outcomes: a command that cannot produce evidence is `BLOCKER`; a successful command outside an accepted hard invariant or tolerance is `REGRESSION`.

## Baseline Policy

- Use exact expected values for hard invariants, authority precedence, formulas, and deterministic structural output.
- Use declared tolerances for stochastic runtime comparisons and explain the statistic, run count, and seeds.
- Never automatically rewrite an accepted baseline.
- Baseline changes require explicit CBO approval and a dated [Balance Ledger decision](./balance-ledger.md#decision-log).
- Asset-specific values are not promoted into global doctrine without a stated systemic justification.
- A changed baseline and the production change that motivated it remain independently reviewable.

## Runner Modes

| Mode | Required contents |
|---|---|
| `quick` | TypeScript, core resolver smoke, cooldown-authority smoke, Character Builder power smoke, Outcome Calculator smoke. |
| `axes` | Threat, Survivability, Pressure, and Control Pressure suites that are compatible; incompatible dedicated audits return `SKIPPED_INCOMPATIBLE`, never a false pass. |
| `runtime` | Deterministic Combat Lab reference suites with registry-defined runs and seeds. |
| `full` | Every compatible registered suite; incompatible and missing families are explicitly reported. |
| `changed` | Suites associated by the registry with changed production paths; always includes schema/provenance validation for emitted results. |

## Failure Severity

| Severity | Meaning |
|---|---|
| `BLOCKER` | Command/provenance/mutation-safety failure makes evidence unusable or unsafe. |
| `REGRESSION` | A valid run violates an accepted invariant or tolerance. |
| `WARNING` | Evidence is valid but incomplete, noisy, or near a review boundary. |
| `INFORMATIONAL` | Valid observation with no accepted-baseline breach. |
| `SKIPPED_INCOMPATIBLE` | Suite is registered but cannot run honestly under current authority or provenance contracts. |

`PASS` is the successful suite status; the table above defines non-pass severities.

## Future Implementation Boundary

Recommended exact files for the next authorized pass:

- `scripts/balanceBenchmark.registry.ts` — one suite registry, modes, changed-path associations, commands, seeds, tolerances, and compatibility state;
- `scripts/balanceBenchmark.runner.ts` — one CLI/orchestrator with `--mode`, `--json`, and fail-severity handling;
- `scripts/balanceBenchmark.schema.ts` — one shared result schema, validation, and aggregation types.

The runner should invoke existing scripts rather than duplicate their formulas or shell orchestration. It must reject registered commands that declare or exhibit DB, asset, tuning, seeder, or baseline mutation. No implementation file is created in this pass.
