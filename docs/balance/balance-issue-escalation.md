# Balance Issue Escalation

This workflow is mandatory for browser findings, audit anomalies, benchmark drift, and asset concerns. Intake begins with the copyable [Balance Ledger template](./balance-ledger.md#browser-finding-intake-template), and the final disposition is recorded in that ledger.

## Classification Layers

Every finding is separated into five truths before a patch is chosen:

1. **Runtime Truth** — what actually happens at the table or in the authoritative runtime.
2. **Calculator Truth** — whether radar, summaries, and outputs represent Runtime Truth.
3. **Economic Truth** — whether the runtime effect is priced fairly, including reliability and opportunity cost.
4. **Asset Truth** — whether the saved asset is appropriately authored under accepted runtime and economics.
5. **Communication Truth** — whether UI wording and presentation lead the user to the correct conclusion.

A single observation may implicate several layers, but each layer gets a separate verdict.

## Finding Categories

| Category | Meaning |
|---|---|
| `CURRENT_LANE_BLOCKER` | Evidence invalidates, corrupts, or would immediately obsolete the active implementation lane. |
| `SYSTEMIC_DEFECT` | A reproducible defect affects a class of consumers, assets, or authorable values. It receives an owning lane but does not automatically interrupt the current one. |
| `ASSET_SPECIFIC` | Runtime and doctrine are sound; one saved asset is authored incorrectly or is an intentional outlier needing review. |
| `USEFUL_EVIDENCE_PARKED` | Relevant evidence that cannot yet change the active verdict or patch boundary. |
| `EXPECTED_BEHAVIOUR` | The observation matches accepted doctrine; Communication Truth may still need clarification. |
| `INSUFFICIENT_EVIDENCE` | Saved state, reproduction, baseline, or blast radius is not established. |

## Escalation Ladder

Use this order and stop when the applicable evidence rule is met:

1. Capture the user observation unchanged.
2. Confirm the exact saved state.
3. Reproduce the displayed calculation.
4. Identify the accepted baseline.
5. Run independent runtime evidence where required.
6. Separate Runtime, Calculator, Economic, Asset, and Communication causes.
7. Determine local versus systemic blast radius.
8. Choose one action-owning lane.
9. Patch only the proven layer.
10. Rerun the original browser case.
11. Record the result in the [Balance Ledger](./balance-ledger.md).

## Current-Lane Interruption Rules

A browser finding interrupts the active lane only when it proves or strongly indicates at least one of:

- data loss;
- materially different runtime behaviour across consumers;
- calculation based on a nonexistent runtime mechanic;
- database corruption;
- invalid test evidence for the active patch;
- a systemic defect that would make the active implementation immediately obsolete.

Everything else is classified and parked with an owner. Severity, surprise, or an undesirable screenshot alone is not an interruption criterion.

## Patch Separation Rules

- Calculator and asset changes do not share a patch unless separation is demonstrably impossible.
- Cost-model and asset changes remain separate.
- Runtime and calculator changes remain separate where practical.
- Database reconciliation follows authority changes, not the reverse.
- No asset is tuned around known broken economics.
- Communication changes may clarify accepted behaviour but must not disguise a runtime, calculator, or economic defect.
- A patch may reference evidence from another layer without silently expanding its implementation boundary.

## Evidence Stopping Rules

### Display/Data Mismatch

Stop once:

- exact saved state is confirmed;
- two consumers are proven to use different values;
- the authority path is identified.

At that point the action is an authority/consumer patch; more screenshots do not refine the boundary.

### Calculator Semantic Defect

Stop once:

- the calculator credits a mechanic absent from runtime;
- a component-preserving ablation proves material impact;
- one independent runtime comparison confirms direction.

### Asset Durability

Normally sufficient:

- one accepted anchor;
- the current asset;
- the asset without the suspect power;
- two deterministic seeds;
- at least `500` runs per seed;
- median and average persistence;
- one or two candidate packages.

More runs are required only for rare-event behaviour or unstable distributions that could change the selected package or verdict.

### Systemic Pricing Defect

Stop once:

- the full authorable grid is reproduced;
- the cost decomposition is known;
- expected output and reliability are compared;
- runtime value is sampled;
- the affected-asset blast radius is inventoried.

### Evidence Budget Rule

> Stop collecting evidence when additional evidence cannot reasonably change the selected action, patch boundary, or verdict.

Every investigation report must state: **What decision could further evidence still change?** If the answer is “none,” evidence collection stops. If the answer names only a future lane, park the finding there.

## Browser Review Response Format

Use this CBO response structure:

```text
Classification:

What the observation proves:

What it does not prove:

Current-lane impact:

Required evidence:

Next owner/action:
```

The response must use the same finding categories and truth-layer names defined above.
