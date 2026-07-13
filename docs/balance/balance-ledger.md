# Balance Ledger

This is the live operational index for balance work. Evidence detail remains in focused reports such as [Level 3 Combat Balance State](./level-3-combat-balance-state.md); finding triage follows the [Balance Issue Escalation Workflow](./balance-issue-escalation.md), and automation expectations live in the [Balance Benchmark Contract](./balance-benchmark-contract.md).

## Operating Rule

- Only one primary balance implementation lane should be active at a time.
- Browser findings may be submitted continuously, but each finding is classified before it can interrupt the active lane.
- Findings that do not meet the current-lane interruption rules are parked here with an owner.
- Assets are not modified while the underlying runtime, calculator, authority, or pricing doctrine remains unstable.
- Runtime Truth, Calculator Truth, Economic Truth, Asset Truth, and Communication Truth are recorded separately.

## Current Baseline

| Item | Current accepted baseline |
|---|---|
| Branch | `main` |
| Remote-aligned commit | `1a08fead5ef10b16fbab58d924b95b1be16f03da` — `feat: add uncover concealed truth contract family` |
| Active Power Tuning | `cmo9w500h00001wwchd9mginh`, **Augment Guard vs Bravery pass**, updated `2026-04-25T18:31:13.653Z` |
| Active Combat Tuning | `cmnyupys70000y4wckzvry4wr`, **Combat Tuning Default v1**, updated `2026-06-02T18:30:09.213Z` |
| Active Outcome Normalization | `cmnxlolx70000bcwc40ebrjk8`, **Outcome Normalization Default v1**, updated `2026-04-27T11:36:46.673Z` |
| Level 3 attack ruler | `4xD8 W/S2` is the practical medium/default attack ruler. |
| Radar midpoint doctrine | For calibrated Level 3 packages, the accepted package for the relevant level and tier targets radar `5`, within the axis-specific tolerance. This is a tier-relative reference midpoint, not a claim that every asset or axis should equal `5`. |

Tuning identifiers are observed runtime provenance, not permission to edit tuning rows. Reconfirm them whenever evidence is collected from the database.

## Completed and Pushed

| Lane | Verified commits |
|---|---|
| Level 3 combat balance state snapshot | `bf215a65ac91e1c5a37004aab0a28a1b964cc81d` — `docs: add level 3 combat balance state snapshot` |
| Threat recalibration | `483676b4f92dbf86ccd186e1126178f6dc16d102` — `balance: recalibrate outcome threat axes`; `e11c985b4916a8fa61e20dd581947ddfb7b4e81b` — `ui: explain outcome threat axis scoring` |
| Survivability recalibration | `f95a5e4e5655fb3ec624bb1cc191e46b9b06d8b9` — durability audit; `86f1adf0f00738ba9c9b17bcd6a24fbd73e33b1c` — durability axes; `739130772f853f9e81113081dff56be5c4775635` — UI explanation |
| Pressure recalibration | `4e2a960359107cf85d934366afb617c5688a3b70` — `balance: recalibrate outcome pressure axis`; `ce4e3f34179dfd52746a423eb0e7e49ed06384ae` — UI explanation |
| Control Pressure semantic model and UI | `d55e5c68404254ec9a7521cd237330c152c72295` — reconciliation audit; `07d83d1c5da60983b0b8fc86f1409e42ea6965c4` — semantic axis; `7ca2b374551cc9a228091d70b109d913ddd62528` — audit update; `ccfcab09fc0cd8e322f36b902cf748b681e48a6d` — UI explanation |
| Durability Protection/runtime semantics | `eb9ce8a0b53e6049c40d78a9009a7b557e12aa74` — `balance: align durability protection with runtime` |
| Centralized current-balance cooldown authority | `12d9b8bdbf6bb72a055b22c55a0af2f290864660` — `fix: centralize power cooldown authority` |

## Active Lane

**Balance operations infrastructure**

Goal: establish this ledger, one mandatory finding-escalation workflow, evidence stopping rules, and a read-only benchmark-harness contract.

Completion criteria:

- the three control-plane documents agree on terms and link to one another;
- current scripts are inventoried with compatibility status;
- future findings have one intake template and one interruption rule;
- the next automation pass has an explicit read-only runner boundary;
- no production code, asset, tuning row, database row, or benchmark runner is changed in this lane.

## Next Ordered Lanes

Current repository evidence does not justify changing this order. Compatibility repairs needed by the future benchmark runner should be made in the owning lane, not used to bypass authority or economic work.

1. Save-time cooldown-cache synchronization.
2. Persisted cooldown-row reconciliation.
3. Broaden shared success-scaled-effect audit.
4. Patch dice × potency and family-specific reliability economics.
5. Recalculate affected cooldowns.
6. Review affected assets in batches.
7. Final Dire Wolf revision.
8. Resume Synergy evidence/calibration.
9. Mobility evidence/calibration.

## Blocked Items

| Item | Blocker | Unblock condition | Owning future lane |
|---|---|---|---|
| Final Dire Wolf asset revision | Mental durability communication, Health generation, and affected economics are not yet separated into proven layers. | Complete affected-asset review after economics/cooldown recalculation, with the mental-vulnerability evidence classified. | Final Dire Wolf revision |
| Final Sudden Leap authoring | Current cooldown authority resolves cadence, but stored-cache synchronization, row reconciliation, and affected economics remain unfinished. | Complete cache synchronization, row reconciliation, economic patch, and cooldown recalculation. | Affected-asset review batches |
| Synergy production patch | Synergy evidence is not calibrated and the current helper is incompatible with centralized cooldown authority. | Migrate the helper, rerun evidence, and obtain a systemic verdict. | Resume Synergy evidence/calibration |
| Untracked Synergy reconciliation helper commit | `scripts/balanceAudit.summoningCircleSynergyReconciliation.ts` calls the raw generic adapter without resolved authority at line 347 and also lacks downstream authority attachment. | Migrate to active-tuning authority, validate, and authorize the file separately. | Resume Synergy evidence/calibration |
| Cooldown cache backfill | Authority is fixed at consumption time, but save-time cache synchronization and the stale-row inventory do not exist. | Define save-time synchronization first, then inventory and reconcile persisted rows. | Save-time synchronization, then row reconciliation |
| Global Health formula changes | Two browser observations do not establish a systemic level/tier/attribute defect. | Produce a full level × tier × attribute grid and classify runtime, calculator, asset, and communication effects. | Future Health-generation audit |

## Parked Browser Findings

### Dire Wolf Mental Survivability

Observed saved/displayed state:

- Mental Health `36`;
- Mental Defence `3D8`;
- block `1` per success;
- Natural Mental Protection `1`;
- no mental defensive powers;
- no mental Resist dice;
- displayed Mental Survivability approximately `7.5–8`;
- user perception: the display communicates broad mental strength despite intended vulnerability.

Classification:

- not a cooldown-authority blocker;
- requires later separation of raw mental-damage persistence from Control, Debuff, attribute-targeting, and Resist vulnerability;
- potential Communication Truth issue and Health-generation audit item;
- no asset change is authorized by this observation alone.

### Health Generation

Observed: D4 Fortitude generated Physical Health `34`; D4 Intellect appeared alongside Mental Health `36`.

Current verdict: this evidence does not prove the global formula is broken. A full level × tier × attribute grid is required before changing the formula. Until then this remains `INSUFFICIENT_EVIDENCE` and does not interrupt the active lane.

## Decision Log

| Date | Decision |
|---|---|
| 2026-07-09 | Table truth takes precedence over builder cost; builders and calculators must describe actual table value rather than create it. |
| 2026-07-09 | The practical Level 3 medium attack ruler is `4xD8 W/S2`. |
| 2026-07-10 | Calibrated standard packages are judged against a level- and tier-relative radar midpoint of `5`. |
| 2026-07-11 | Live-derived defence strings do not receive duplicate static Protection credit. |
| 2026-07-13 | Current active tuning is authoritative for gameplay cooldown; stored cooldown is cache/diagnostic data only. |
| 2026-07-13 | Fixed power scaffolding must not blindly multiply with dice × potency output; family-specific reliability economics require their own evidence. |
| 2026-07-13 | Browser reviews are diagnostic triggers, not automatic asset-change instructions. |

## Browser Finding Intake Template

Copy this block into the ledger or the investigation handoff:

```text
Date:
Tool/page:
Saved asset ID:
Level/tier:
Observed value:
Expected intuition:
Screenshot/reference:
Exact saved state confirmed? Yes / No
Initial classification:
Current-lane impact:
Status:
Follow-up owner:
```

Apply the classification and escalation rules in [Balance Issue Escalation](./balance-issue-escalation.md) before changing the active lane.
