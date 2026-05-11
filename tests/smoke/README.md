# Browser Smoke Tests

This is the first Playwright smoke harness for repeated browser regression checks. It targets a prepared local/dev fixture and does not create users, reset the database, or mutate Party Stash inventory.

## Required Environment

Set these before running the smoke suite:

```powershell
$env:SMOKE_BASE_URL = "http://localhost:3000"
$env:SMOKE_CAMPAIGN_ID = "<campaign id>"
$env:SMOKE_GD_EMAIL = "<game director email>"
$env:SMOKE_GD_PASSWORD = "<game director password>"
$env:SMOKE_PLAYER_EMAIL = "<player email>"
$env:SMOKE_PLAYER_PASSWORD = "<player password>"
$env:SMOKE_STASH_MANAGER_EMAIL = "<stash manager email>"
$env:SMOKE_STASH_MANAGER_PASSWORD = "<stash manager password>"
$env:SMOKE_PLAYER_CHARACTER_ID = "<player character id>"
```

Optional future fixture variables:

```powershell
$env:SMOKE_GD_CHARACTER_ID = "<gd-visible character id>"
$env:SMOKE_OTHER_PLAYER_CHARACTER_ID = "<other player character id>"
```

## Fixture Expectations

The campaign fixture should contain:

- A Game Director account that can manage campaign members.
- A normal Player account that can open player-facing campaign tools.
- A Stash Manager account with Party Stash assignment permission but without campaign member admin visibility.
- An active character assigned to the normal Player for `SMOKE_PLAYER_CHARACTER_ID`.
- At least one unassigned Party Stash item if you want the Stash Manager assignment-column assertion to exercise the full assign surface.

## Running

Start the app separately:

```powershell
npm run dev
```

Run smoke tests:

```powershell
npm run smoke:e2e
```

Useful local modes:

```powershell
npm run smoke:e2e:headed
npm run smoke:e2e:ui
```

The suite uses `SMOKE_BASE_URL` and defaults to `http://localhost:3000`.

## QA Agent Operating Guide

The QA Harness is the dice roller. The QA Agent reads the dice and explains the encounter.

Before running smoke tests, confirm required `SMOKE_*` variables are present without printing secret values:

```powershell
Get-ChildItem Env:SMOKE_* |
  Sort-Object Name |
  Select-Object Name, @{Name="Set";Expression={ if ($_.Value) { "YES" } else { "NO" } }}
```

Run the suite with:

```powershell
npm run smoke:e2e
```

When a failure occurs, stop after the first failure is understood. Inspect the Playwright error output, screenshot path, trace path, and any `test-results` error-context files. Do not chase every later failure until the first one has been classified.

Classify the first failure as one of:

- app regression
- brittle selector/test assumption
- missing/incorrect fixture data
- auth/session/env issue
- expected UI copy changed
- test overreach

Then summarize the likely cause and produce a focused Codex fix prompt that names the failing file, test, selector or action, observed evidence, and desired smallest safe patch.

QA agents should avoid modifying app code unless explicitly asked, avoid hardcoding credentials, avoid database reset, and avoid broad test rewrites. Prefer focused selector/test fixes when the UI is present and the failure is clearly a brittle smoke assumption.

## Current Coverage

- Campaign member privacy: GD visibility versus Player privacy.
- Party Stash permissions: normal Player read-only view versus Stash Manager assignment surface.
- Character Builder load: core sections, save control, and basic collapse/expand behaviour.
- Character Builder Powers: power budget visibility, Add Power control, and incomplete Attack validation.

## Non-Goals For This Pass

- No automatic fixture creation.
- No database reset.
- No inventory mutation.
- No deep power-authoring matrix.
- No replacement for manual visual/layout review.
