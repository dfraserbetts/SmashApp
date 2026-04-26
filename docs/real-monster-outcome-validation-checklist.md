# Real Monster Outcome Validation Checklist

Use this worksheet when validating the Summoning Circle Outcome Calculator against authored, real campaign monsters. Active tuning snapshots are the live balance truth; source defaults are smoke-test only. Do not judge live balance from defaults mode.

## Required Pre-Check

Before manual validation, refresh and confirm the live calibration state:

- Run `npm run calibration:export-active-tuning`.
- Run `npx --yes tsx scripts/outcomeCalibrationHarness.ts --tuning active`.
- Confirm the harness reports `FULL ACTIVE SNAPSHOT`.
- Record the active harness pass / warn / fail counts before judging any real monster.

If the active harness is not clean, stop and resolve that first. Defaults mode is only for smoke-test coverage; it is not live balance evidence.

## Manual Pass

- Pick 6-10 real monsters that represent different levels, tiers, and combat jobs.
- For each monster, write expected radar bands before opening or recalculating the outcome result.
- Compare the calculator output against the expectation, then classify any mismatch by likely owner layer.

Owner layer options:

- `fixture expectation`
- `monster authoring`
- `Power Tuning`
- `Combat Tuning`
- `Outcome Normalization`
- `code/routing bug`

## Suggested First Pass

Start with these six real-monster slots:

1. Gazzkill or the closest Level 4 Boss baseline body: restrained attributes, no PPV/MPV, no defensive powers.
2. Low-level basic minion attacker: simple weapon or natural attack, no powers, no defensive package.
3. Low-level skirmisher: high Guard/Dodge feel, mobile but not heavily protected.
4. Mid-level controller: forced movement, control, or debuff pressure.
5. Mid/high-level mental specialist: mental attack and MPV/mental protection emphasis.
6. High-level tank or boss: strong pools, PPV/MPV, protection, and low-to-moderate threat.

Add 2-4 more monsters if any result feels ambiguous, especially:

- a support commander or ally-buff monster
- a glass cannon with a high-threat power
- a mixed physical/mental boss
- a high-mobility Teleport/Fly monster

## Review Table

| # | Monster name | Level / tier | Intended role | Expected radar bands before calculation | Actual radar bands | Raw axis values of concern | Main contributor / source | Mismatch notes | Suspected owner layer | Action / next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |
| 2 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |
| 3 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |
| 4 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |
| 5 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |
| 6 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |
| 7 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |
| 8 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |
| 9 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |
| 10 |  |  |  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  | Physical Threat:  / Mental Threat:  / Physical Survivability:  / Mental Survivability:  / Manipulation:  / Synergy:  / Mobility:  / Presence:  |  |  |  |  |  |

## Mismatch Triage

Use these prompts before tuning anything:

- Do not tune from one manual monster unless it exposes a clear routing/code bug.
- If a mismatch seems real, add it as a future calibration fixture first, then tune against the fixture set.
- If the actual result matches the authored monster better than the expectation, mark `fixture expectation`.
- If the monster has missing attacks, wrong tier, stale pools, missing protection, or mis-modeled powers, mark `monster authoring`.
- If a power-led axis is too high or too low before display normalization, mark `Power Tuning`.
- If pools, protection, Dodge, PPV, MPV, or baseline body contribution is wrong before display normalization, mark `Combat Tuning`.
- If raw values look reasonable but radar bands are too high or too low, mark `Outcome Normalization`.
- If the wrong axis receives value, a packet routes through the wrong branch, or active tuning is not being applied, mark `code/routing bug`.

Record exact notes for any mismatch that might become a future calibration fixture.
