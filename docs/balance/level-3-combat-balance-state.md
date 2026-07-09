# Level 3 Combat Balance State

## 1. Provenance

- Date: 2026-07-09
- Repo HEAD: `f81e8f40fa82f1dae35dbc03c8f9edc2c0e82ce5`
- Commit: `balance: use candidate support in party context reporter`
- Campaign: `Balance Environment`
- Campaign ID: `250aee5e-632f-405c-ba36-a49ed12a5afc`
- Asset source: `balance-campaign-authored`
- Runtime evidence source: Combat Lab `runCombatScenario`

Reporter commands used for this snapshot:

```text
npx --yes tsx scripts/combatLab.partyBossContextRead.ts --runs 100 --seed 4242
npx --yes tsx scripts/combatLab.partyBossContextRead.ts --runs 100 --seed 9001
npx --yes tsx scripts/combatLab.partyBossContextRead.ts --runs 100 --seed 4242 --json
npx --yes tsx scripts/combatLab.partyBossContextRead.ts --runs 100 --seed 9001 --json
npx --yes tsx scripts/combatLab.legendaryEliteBenchmarkMatrix.ts
```

This is a Level 3 benchmark snapshot. It is not universal balance law, player-facing rules text, or approval to change runtime mechanics.

## 2. Accepted Design Doctrine

- The practical Level 3 medium attack ruler is `4xD8 W/S2`.
- Current W/S interpretation:
  - `W/S2`: medium/default attack pressure.
  - `W/S3`: strong normal or specialist pressure.
  - `W/S4`: heavy specialist pressure.
  - `W/S6`: burst, signature, or high-pressure output.
  - `W/S8`: extreme signature/review territory.
- Half-step strengths are valid tuning tools.
- Level and rarity budgets should scale affordability. They should not discount the table value of high-output effects merely because an item or power is high level.
- Current accepted outputs must not be used to justify runtime changes without a separate evidence pass.

## 3. Accepted Builder And Table-Truth State

- Character Power Builder high W/S pressure costs were raised.
- Second-packet complexity cost was raised.
- Forge high-strength costs were raised.
- Forge half-strength rows were verified so `.5` strengths are not defaulting to arbitrary low costs.
- Forge budgets scale by level and rarity.
- Power Builder, Forge, and Summoning Circle should reflect table truth. They are not arbitrary UI prices.

## 4. Normal Boss Accepted Lane

Normal Boss rows are supported/lower-bound Boss context reads. They are not proof that a Boss should solo a party without backup, minions, terrain, objectives, or encounter pressure.

Accepted roles:

- `BALANCE_Boss Warlord`: lower-bound martial cleave Boss.
- `BALANCE_Boss Hexlord`: sharp mental Boss with Mindward counterplay.
- `BALANCE_Boss Behemoth`: heavy physical multi-target Boss.

| Scenario | Seed | Party Win | Enemy Win | Draw | Avg Rounds | Party DPR | Enemy DPR |
|---|---:|---:|---:|---:|---:|---:|---:|
| Standard Party vs Boss Warlord | 4242 | 98% | 2% | 0% | 3.13 | 23.71 | 49.54 |
| Standard Party vs Boss Warlord | 9001 | 96% | 4% | 0% | 3.19 | 23.38 | 48.20 |
| Standard Party vs Boss Hexlord | 4242 | 60% | 40% | 0% | 4.48 | 15.42 | 48.84 |
| Standard Party vs Boss Hexlord | 9001 | 65% | 35% | 0% | 4.35 | 16.59 | 48.59 |
| Mindward Party vs Boss Hexlord | 4242 | 93% | 7% | 0% | 3.13 | 22.02 | 57.05 |
| Mindward Party vs Boss Hexlord | 9001 | 97% | 3% | 0% | 2.80 | 24.95 | 57.33 |
| Standard Party vs Boss Behemoth | 4242 | 81% | 19% | 0% | 4.09 | 18.06 | 63.90 |
| Standard Party vs Boss Behemoth | 9001 | 86% | 14% | 0% | 3.89 | 18.98 | 61.47 |

Interpretation:

- Warlord is acceptable as a lower-bound supported Boss candidate.
- Hexlord is intentionally sharp into the standard party. Mindward counterplay is real evidence and should not be ignored.
- Behemoth has meaningful pressure without crossing the current heat guardrail.

## 5. Legendary Boss Accepted Lane

Accepted roles:

- `BALANCE_Legendary Dragon`: broad physical Legendary sweeper.
- `BALANCE_Legendary Lich`: focused mental Legendary execution threat.

| Scenario | Seed | Party Win | Enemy Win | Draw | Avg Rounds | Party DPR | Enemy DPR |
|---|---:|---:|---:|---:|---:|---:|---:|
| Standard Party vs Legendary Dragon | 4242 | 72% | 26% | 2% | 9.00 | 13.73 | 26.16 |
| Standard Party vs Legendary Dragon | 9001 | 80% | 20% | 0% | 8.81 | 14.40 | 26.44 |
| Standard Party vs Legendary Lich | 4242 | 89% | 11% | 0% | 5.36 | 21.38 | 26.76 |
| Standard Party vs Legendary Lich | 9001 | 87% | 13% | 0% | 5.54 | 20.24 | 26.62 |

Interpretation:

- Dragon is the current stronger Legendary Boss pressure row.
- Lich is accepted as a first-pass focused mental Legendary threat, not final proof that all Legendary Boss offence is complete.

## 6. Supported-Elite Accepted Provisional Benchmark Lane

Old Soldier-support rows were rejected as dead pressure. The official party/Boss context reporter now uses full mixed Candidate Support rows.

Accepted provisional support package:

- `BALANCE_Support Candidate Pressure Striker`
- `BALANCE_Support Candidate Guard Anchor`
- `BALANCE_Support Candidate Suppression Hexer`

Official supported-Elite rows:

| Scenario | Seed | Party Win | Enemy Win | Draw | Avg Rounds | Party DPR | Enemy DPR |
|---|---:|---:|---:|---:|---:|---:|---:|
| Standard Party vs Duelist with Candidate Support | 4242 | 85% | 10% | 5% | 9.01 | 20.44 | 23.47 |
| Standard Party vs Duelist with Candidate Support | 9001 | 84% | 11% | 5% | 8.92 | 20.58 | 23.28 |
| Standard Party vs Hexer with Candidate Support | 4242 | 93% | 3% | 4% | 8.00 | 22.31 | 19.94 |
| Standard Party vs Hexer with Candidate Support | 9001 | 89% | 7% | 4% | 8.30 | 21.46 | 20.31 |
| Standard Party vs Rotation with Candidate Support | 4242 | 90% | 9% | 1% | 7.66 | 22.12 | 23.63 |
| Standard Party vs Rotation with Candidate Support | 9001 | 87% | 7% | 6% | 8.48 | 20.37 | 22.54 |

Interpretation:

- The full mixed candidate package is accepted provisionally as the supported-Elite benchmark baseline.
- Duelist plus Candidate Support is the hottest official supported-Elite row, but not too hot.
- Hexer plus Candidate Support is softer, but still no longer dead pressure.
- Rotation plus Candidate Support remains useful without demanding new anti-tank mechanics.
- Doubled Pressure Striker is explicitly rejected as a baseline because candidate probe evidence showed it overshoots.

## 7. Deliberately Parked

The following are not approved by this snapshot:

- Pierce
- Guard Break
- Sunder
- Expose
- True Strike
- minimum damage
- ignore-defence rules
- forced targeting
- taunt
- bodyguard/interception
- Boss, Elite, support, or runtime changes based only on this snapshot
- duplicating Pressure Striker as an official supported-Elite baseline
- changing Hexlord just because it is sharp into the standard party

Mindward counterplay is part of the Hexlord evidence. Do not erase that context.

## 8. Current Weak Spots And Future Lanes

- Supported-Elite candidate labels may later be promoted or renamed.
- Support-role design may need another pass later, but the current baseline is accepted for now.
- Party targeting, positioning, terrain, objective pressure, and map geometry remain simulator limitations.
- Reporter hydration warnings remain diagnostic noise unless separately investigated.
- This snapshot does not solve all encounter design.
- Boss encounter context still needs actual backup, minions, terrain, objectives, or support packages before drawing final encounter conclusions.

## 9. Decision Summary

| Area | Status |
|---|---|
| Power/Forge high-output costing | Accepted |
| Normal Boss offence | Accepted |
| Legendary Boss offence | Accepted first pass |
| Supported-Elite benchmark | Accepted provisional |
| Runtime targeting changes | Not approved |
| New anti-tank mechanics | Parked |

