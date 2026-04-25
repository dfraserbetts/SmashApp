# Outcome Calibration Tuning Snapshots

The outcome calibration harness can load exported active admin tuning snapshots from this directory. Active snapshots are the intended source for balance calibration because the live Summoning Circle uses active admin tuning sets.

Source defaults are still useful, but only as a fallback/code-safety smoke test. A defaults run is not live balance truth.

Run active snapshot calibration:

```bash
npx --yes tsx scripts/outcomeCalibrationHarness.ts --tuning active
```

Run source-default smoke mode:

```bash
npx --yes tsx scripts/outcomeCalibrationHarness.ts --tuning defaults
```

Supported files:

- `active-power-tuning.json`
- `active-combat-tuning.json`
- `active-outcome-normalization.json`

Export the current local database's active admin tuning sets:

```bash
npm run calibration:export-active-tuning
```

This writes all three snapshot files listed above. The export fails if any active tuning set is missing. Committed snapshots represent a specific calibration truth from the database they were exported from, so update them intentionally when active admin tuning changes.

All files are optional. In active mode, if a file is absent, the harness uses source defaults for that layer and prints `MIXED TUNING MODE: not full active balance truth.` Mixed mode is allowed, so one layer can use a snapshot while the others use defaults, but mixed results should not be treated as full live balance truth.

If no `--tuning` flag is provided, the harness uses active mode when at least one snapshot file exists. If no snapshot files exist, it falls back to source-default smoke mode and prints that this is not live balance truth.

Snapshots may be either a partial values object:

```json
{
  "values": {
    "packet.magnitude.movementTypeMultiplier.run": 0.8
  }
}
```

Or a full active tuning snapshot:

```json
{
  "setId": "example-id",
  "name": "Augment Guard vs Bravery pass",
  "slug": "augment-guard-vs-bravery-pass",
  "status": "ACTIVE",
  "updatedAt": "2026-04-24T00:00:00.000Z",
  "values": {
    "packet.magnitude.movementTypeMultiplier.run": 0.8
  }
}
```

Absent keys inside a snapshot fall back through the normal source defaults for that layer. No database connection is required. The harness prints `Calibration tuning mode`, `Balance truth status`, and a `Tuning source` section at startup so every run shows exactly which layers came from snapshots and which came from source defaults.
