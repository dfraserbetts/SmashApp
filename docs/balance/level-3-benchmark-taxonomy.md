# Level 3 Benchmark Taxonomy

## Purpose

This is an internal diagnostic balance document for the current Level 3
Benchmark Environment assets. It records what each benchmark asset is for,
what current runtime evidence says, and what must not be inferred from these
one-on-one tests.

This is not player-facing rules text. It does not lock new combat rules, cost
formulas, or tuning values. It is a checkpoint for balance interpretation.

## Current Evidence Snapshot

- Repo HEAD: `9b958cd10797c88176389087c24c40d42f309274`
- Campaign: `Balance Environment`
- Campaign ID: `250aee5e-632f-405c-ba36-a49ed12a5afc`
- Asset source: `balance-campaign-authored`
- Runtime: Combat Lab `runCombatScenario`
- Run count: 100 per scenario
- Seeds: `4242`, `9001`
- Matrix reporter:
  - `npx --yes tsx scripts/combatLab.legendaryEliteBenchmarkMatrix.ts --runs 100 --seed 4242`
  - `npx --yes tsx scripts/combatLab.legendaryEliteBenchmarkMatrix.ts --runs 100 --seed 9001`
  - JSON was also checked for both seeds.

These results are one-on-one Legendary Elite diagnostic evidence. They are not
full party evidence, Boss encounter evidence, or encounter-design proof.

### Seed 4242 Summary

| Scenario | Attacker Win | Defender Win | Draw | Avg Rounds | Control U/L/R | Debuff U/L/R | Rider Damage/Run |
|---|---:|---:|---:|---:|---:|---:|---:|
| Duelist vs Hawkshot | 39% | 61% | 0% | 7.30 | 0/0/0 | 0/0/0 | 0 |
| Duelist vs Ranger | 55% | 45% | 0% | 7.04 | 0/0/0 | 0/0/0 | 0 |
| Duelist vs Stoneguard | 1% | 30% | 69% | 15.46 | 0/0/0 | 0/0/0 | 0 |
| Duelist vs Arcane Sage | 100% | 0% | 0% | 5.16 | 0/0/0 | 0/0/0 | 0 |
| Hexer vs Hawkshot | 76% | 24% | 0% | 5.18 | 0/0/0 | 0/0/0 | 0 |
| Hexer vs Ranger | 75% | 25% | 0% | 5.25 | 0/0/0 | 0/0/0 | 0 |
| Hexer vs Stoneguard | 100% | 0% | 0% | 4.84 | 0/0/0 | 0/0/0 | 0 |
| Hexer vs Arcane Sage | 75% | 14% | 11% | 14.88 | 0/0/0 | 0/0/0 | 0 |
| True Hexer vs Hawkshot | 6% | 94% | 0% | 6.52 | 1.92/0.45/1.47 | 2.21/0.59/1.62 | 5.28 |
| True Hexer vs Ranger | 15% | 85% | 0% | 6.48 | 1.94/0.43/1.51 | 2.24/1.03/1.21 | 8.16 |
| True Hexer vs Stoneguard | 94% | 6% | 0% | 8.49 | 2.63/0.84/1.79 | 2.95/1.99/0.96 | 17.16 |
| True Hexer vs Arcane Sage | 0% | 76% | 24% | 16.42 | 5.42/1.11/4.31 | 5.71/0.08/5.63 | 5.72 |
| Rotation vs Hawkshot | 1% | 99% | 0% | 7.98 | 1.94/0.83/1.11 | 2.78/0.53/2.25 | 12.58 |
| Rotation vs Ranger | 11% | 89% | 0% | 7.54 | 1.88/0.82/1.06 | 2.60/0.36/2.24 | 12.32 |
| Rotation vs Stoneguard | 53% | 24% | 23% | 13.23 | 3.20/2.24/0.96 | 4.74/1.58/3.16 | 42.42 |
| Rotation vs Arcane Sage | 86% | 14% | 0% | 9.47 | 2.12/0.03/2.09 | 3.22/0.52/2.70 | 3.96 |

### Seed 9001 Summary

| Scenario | Attacker Win | Defender Win | Draw | Avg Rounds | Control U/L/R | Debuff U/L/R | Rider Damage/Run |
|---|---:|---:|---:|---:|---:|---:|---:|
| Duelist vs Hawkshot | 40% | 60% | 0% | 7.14 | 0/0/0 | 0/0/0 | 0 |
| Duelist vs Ranger | 40% | 60% | 0% | 6.98 | 0/0/0 | 0/0/0 | 0 |
| Duelist vs Stoneguard | 0% | 38% | 62% | 14.52 | 0/0/0 | 0/0/0 | 0 |
| Duelist vs Arcane Sage | 100% | 0% | 0% | 5.23 | 0/0/0 | 0/0/0 | 0 |
| Hexer vs Hawkshot | 68% | 32% | 0% | 5.45 | 0/0/0 | 0/0/0 | 0 |
| Hexer vs Ranger | 74% | 26% | 0% | 5.04 | 0/0/0 | 0/0/0 | 0 |
| Hexer vs Stoneguard | 99% | 1% | 0% | 5.07 | 0/0/0 | 0/0/0 | 0 |
| Hexer vs Arcane Sage | 70% | 13% | 17% | 15.21 | 0/0/0 | 0/0/0 | 0 |
| True Hexer vs Hawkshot | 8% | 92% | 0% | 6.46 | 1.91/0.34/1.57 | 2.19/0.96/1.23 | 6.96 |
| True Hexer vs Ranger | 7% | 93% | 0% | 6.24 | 1.84/0.31/1.53 | 2.17/0.96/1.21 | 7.44 |
| True Hexer vs Stoneguard | 87% | 13% | 0% | 8.44 | 2.58/0.73/1.85 | 3.00/2.01/0.99 | 17.64 |
| True Hexer vs Arcane Sage | 0% | 74% | 26% | 15.92 | 5.28/1.06/4.22 | 5.50/0.17/5.33 | 5.96 |
| Rotation vs Hawkshot | 2% | 98% | 0% | 7.75 | 1.95/0.67/1.28 | 2.69/0.63/2.06 | 12.06 |
| Rotation vs Ranger | 12% | 88% | 0% | 7.34 | 1.77/0.79/0.98 | 2.59/0.52/2.07 | 12.74 |
| Rotation vs Stoneguard | 59% | 23% | 18% | 14.74 | 3.59/2.57/1.02 | 5.18/1.75/3.43 | 49.16 |
| Rotation vs Arcane Sage | 88% | 12% | 0% | 9.83 | 2.18/0.05/2.13 | 3.34/0.64/2.70 | 5.68 |

## Benchmark Role Table

| Asset | Current Role | Primary Pressure Type | Expected Strong Matchups | Expected Weak / Counter Matchups | Current Status | Do-Not-Infer Warning |
|---|---|---|---|---|---|---|
| `BALANCE_Legendary Elite Duelist` | Physical duel pressure benchmark | Physical-only natural pressure | Fragile/support profiles, especially `BALANCE_Arcane Sage` | `BALANCE_Stoneguard` hard-counters it; ranged attackers are competitive | Accepted as physical duel pressure diagnostic | Do not infer physical pressure is globally weak because Stoneguard stalls it; Stoneguard is the intended physical counter. |
| `BALANCE_Legendary Elite Hexer` | Mental damage striker benchmark | Repeated mental natural attack, `2xD10`, 3 mental wounds/success | Current comparators broadly, especially Stoneguard | None of the current four comparators cleanly counter it | Reclassified conceptually as mental striker despite name | Do not treat this asset as control/debuff evidence. It has no Control powers, no Debuff powers, and no linked riders. |
| `BALANCE_Legendary Elite True Hexer` | True control/debuff benchmark | Control primary plus linked low mental rider; Attack debuff primary plus linked low mental rider | `BALANCE_Stoneguard` | `BALANCE_Hawkshot Archer`, `BALANCE_Ranger Commander`, `BALANCE_Arcane Sage` | Valid narrow control/debuff diagnostic | Do not infer it is too weak until deciding whether narrow anti-Stoneguard control/debuff is desired. |
| `BALANCE_Legendary Elite Breaker Controller Rotation` | Existing-mechanics anti-tank benchmark | Two-power rotation: Control+damage and Debuff+damage, plus physical fallback | `BALANCE_Stoneguard` | `BALANCE_Hawkshot Archer`, `BALANCE_Ranger Commander` remain safe | Current best anti-tank benchmark path | Do not infer new anti-tank mechanics are needed while this existing-mechanics benchmark is working. |

## Player Comparator Table

| Comparator | Current Representation | What It Does Not Prove |
|---|---|---|
| `BALANCE_Hawkshot Archer` | High physical ranged pressure and burst-risk comparator. Good at punishing enemies that cannot survive or disrupt ranged offence. | Does not represent the whole party, melee pressure, or defensive/tank play. |
| `BALANCE_Ranger Commander` | Ranged/offence profile with command-style pressure and less extreme burst than Hawkshot. | Does not prove support/control durability on its own. |
| `BALANCE_Stoneguard` | Physical counter and tank benchmark. Useful for anti-tank and physical-pressure diagnostics. | Does not prove general durability balance; it is specifically meant to resist physical duel pressure. |
| `BALANCE_Arcane Sage` | Low-DPS support and mental/support comparator that resists some mental/control pressure very well. | Does not represent medium attack output and should not be used as the official average offensive benchmark. |

## Key Current Findings

- Duelist behaves as physical duel pressure and is hard-countered by
  Stoneguard.
- Current Hexer is a mental damage striker, not control/debuff.
- True Hexer is actual control/debuff pressure and is currently narrow.
- Rotation is the current best anti-tank benchmark path.
- Existing-mechanics anti-tank rotation currently makes new anti-tank mechanics
  unnecessary.
- Hexer naming/taxonomy is a known trap: the name suggests control, but current
  runtime behaviour is mental striker pressure.

## Parked / Not Approved Mechanics

The following remain parked and are not approved as mechanics:

- Pierce
- Guard Break
- Sunder
- Crush as a new mechanic
- Expose
- Overwhelm
- True Strike
- minimum damage
- ignore-defence anti-tank rules

Do not introduce these as rules, runtime mechanics, builder fields, locked docs,
or asset mechanics based on the current Level 3 benchmark evidence.

## Known Limitations

- One-on-one Legendary Elite evidence does not prove party/Boss encounter
  balance.
- The current player comparator set is useful but incomplete.
- A dedicated mental-resistant player benchmark may still be needed before
  tuning mental pressure.
- Signature alpha-strike/priming is parked and separate.
- True Hexer defences showed a caution in current runtime output:
  `Physical Defence: 2 x D6, blocks 0/success. Mental Defence: 3 x D8, blocks 0/success.`
  Keep this intentional or review it later.
- Current Hexer name may remain misleading until renamed or explicitly
  reclassified in all balance docs/reports.
- Stored-vs-derived cooldown and display-scaled damage hydration warnings still
  appear in reports. Combat Lab reports the values it actually uses, and these
  warnings should remain visible in evidence.

## Current Do-Not-Touch Guidance

- Do not tune Duelist right now.
- Do not tune Rotation right now.
- Do not nerf current Hexer just because it beats all current comparators.
- Do not broaden True Hexer until deciding whether a narrow control/debuff
  benchmark is desired.
- Do not add new anti-tank mechanics while Rotation is working.

## Recommended Next Decisions

- Decide whether to keep the current Hexer name or eventually rename/reclassify
  it as a mental striker.
- Decide whether True Hexer should stay narrow or receive later
  protection/threat tuning.
- Decide whether to create a mental-resistant player benchmark.
- Decide whether Level 3 attack/defence is ready to move toward party/Boss
  context.
