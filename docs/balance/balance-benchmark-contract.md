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
| 10 | Synergy reconciliation | `scripts/semanticSynergyLevel3.smoke.ts`; `scripts/balanceAudit.summoningCircleSynergyReconciliation.ts` | `AVAILABLE` | The focused smoke owns the approved 19-fixture Level 3 semantic model; the read-only audit reconciles saved semantic, legacy-only, and mixed-model behavior under centralized cooldown authority. |
| 11 | Future Mobility reconciliation | Mobility output in `scripts/balanceAudit.summoningCircleRemainingAxisReconciliation.ts` | `PARTIAL` | An inventory view exists, but the shared script has the authority incompatibility above and there is no accepted Mobility calibration suite. |

All `balanceAudit.*` files currently appear read-only by static mutation-call scan. The runner must still enforce and report mutation safety rather than trusting naming.

## Level 3 Semantic Synergy Contract

Supported new-format allied Augments at Level 3 use semantic Synergy across five target turns. Application reliability uses the creature's actual hydrated Synergy die; D8 remains only the context-free BPV reference. Authoritative cooldown contributes through exact legal activations (`next use = turn + cooldown + 1`) with no additional availability coefficient. Minion, Soldier, and Elite active capacity is one power per turn; Boss capacity is two, and contribution is never divided by capacity.

The canonical Monster Outcome Calculator treats supported semantic Passives as the labelled `PREPARED_ACTIVE` authored-creature reference. It assumes the Passive was legally activated before the measured combat, uses the creature's actual relevant-die distribution once, consumes no measured-combat capacity, and emits `PASSIVE_SYNERGY_PREPARED_ACTIVE_REFERENCE`; it does not claim that a current campaign instance is Active. Prepared Passives retain natural stack degradation and contribute for at most four radar target turns. That four-turn bound is an economic/radar cap, not a runtime expiry.

The finite-horizon model also accepts an `INACTIVE` Passive scenario. Activation then competes with other powers for the Power Action and tier capacity. The actual source-success distribution branches into Active success and still-Inactive failure states; failure creates no free establishment or ordinary cooldown.

Level 3 scores use `min(10, 4 * ln(1 + rawSupport / tierScale))`. The active tier scales and midpoint raw packages are Minion `0.903490017 / 2.25`, Soldier `6.086009140 / 15.15625`, Elite `9.377021719 / 23.352`, and Boss `18.754043438 / 46.704`; each midpoint scores `5` for its own tier.

Semantic-only support replaces the old cost-derived power contribution. Legacy-only support retains the prior path with an explicit diagnostic. Semantic plus legacy power or non-power Synergy fails closed rather than combining models. Healing, Cleanse, generic Support, self-only effects routed to other axes, Response support, unsupported levels/timing/chassis, Restriction value, and removal hardness remain outside semantic Synergy. Legacy asset migration and cross-level calibration are not complete.

## Semantic Passive Combat-Local Lifecycle

The lifecycle doctrine begins each day with a semantic Passive `INACTIVE`. Combat Lab exposes only a combat-local projection of that doctrine, not durable adventuring-day persistence, and missing runtime state defaults to `INACTIVE`. A ready Inactive Passive can activate only through a Power Action: failure spends that choice but leaves it Inactive without cooldown, while success stores the source-success result, applies every packet from that snapshot, and leaves cooldown at zero. An explicitly supplied `ACTIVE` state establishes before ordinary combat actions, reuses its stored source successes without rerolling, and spends no Main Action, Power Action, Response, or active-support capacity. The same explicit Active snapshot can be supplied to later encounters.

Stack degradation, universal cleanup, Resist, and ordinary target-local Cleanse remain local to one target status and never deactivate the source Power. A separately authored source-Power Cleanse succeeds only when its Cleanse successes meet the stored activation-success threshold; success removes every supported status, linked status, and defensive pool from that actor and Power, clears the snapshot, sets the Passive Inactive, and applies its authoritative cooldown once. Source-owned voluntary cancellation is free outside combat or allowed on the owner's turn in combat, requires no roll or action lane, performs the same source-Power removal, and applies cooldown once. Cooldown expiry leaves the Passive Inactive and merely makes a later Power Action activation legal.

Combat results expose final Passive states and lifecycle transitions using stable actor and Power identities, including activation success/failure, combat-start establishment, cancellation, complete Cleanse, and cooldown application/ticks. Persisting those transitions across a campaign day or advancing cooldown outside combat remains deferred to a future campaign-day/rest owner.

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
| `quick` | TypeScript, core resolver smoke, cooldown-authority smoke, Character Builder power smoke, Outcome Calculator smoke, and the Level 3 semantic Synergy smoke. |
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
