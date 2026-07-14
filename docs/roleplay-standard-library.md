# Roleplay Compositional Standard Library

Status: LOCKED NON-NUMERIC ARCHITECTURE.

This document is the focused authority for standard Roleplay Outcome Contract
composition. It supersedes active wording that treats exact Intention / Method /
Scope / Impact tuples as permanent registry variants or permanent privilege-key
owners. Historical exact-cell inventories remain regression evidence only.

## Compositional Descriptor Law

A complete standard descriptor is composed from:

1. one global Scope targeting component;
2. Dice Count;
3. the selected Outcome Contract effect template;
4. contract-specific grammatical Scope tokens; and
5. one Scene Impact fragment.

Authority resolves in this order:

1. Intention filters Methods.
2. Method filters Outcome Contracts.
3. Outcome Contract defines effect identity and Outcome Lane.
4. Scope defines who or how many are affected.
5. Scene Impact defines potency, burden, consequence, or persistence.
6. Dice Count defines reliability.
7. Counter and Additional Restrictions remain separate permissions.

Method owns no Scope or Impact filter. An Outcome Contract remains visible for
its owning Intention and Method even when the current Scope or Impact is not a
completed cell. Scope and Impact availability are resolved after contract
selection.

## Global Scope Targeting Components

- Self: no Choose clause; `Roll X dice.`
- One Target: `Choose one target and roll X dice.`
- Small Group: `Choose a small group of targets and roll X dice.`
- Large Group: `Choose a large group of targets and roll X dice.`
- Faction / Army: `Choose a faction or army and roll X dice.`

Target Eligibility restrictions may replace the normal target phrase under the
existing rule. They do not duplicate or rewrite the effect template.

## Pure Contract Data

Each standard contract owns pure data equivalent to:

- stable ID and player-facing name;
- Outcome Lane;
- owning Intention and standard Method;
- planned supported Scopes;
- one outcome template;
- grammatical tokens for each completed Scope;
- authored Scene Impact fragments;
- Counter default and optional Scope/Impact overrides;
- one family-level privilege key;
- examples and exclusions.

Templates may use named tokens such as `{{subject}}`,
`{{subjectPossessive}}`, `{{memberReference}}`, `{{beliefReference}}`, and
`{{impact}}`. Token names may be contract-specific. Registry entries contain no
render functions, React concerns, generated descriptors, or saved state.

Resolution first substitutes Scope tokens into the selected Impact fragment.
It then substitutes Scope tokens and the resolved `impact` into the outcome
template. Only accidental repeated whitespace is normalized. Authored
punctuation and semantic wording are not silently changed. A blank result or
any unresolved token makes the cell incomplete.

## Complete Standard Cell

A planned Scope by Impact cell is complete only when:

- Intention and Method ownership are valid;
- the Scope is declared supported;
- the Scope token fragment exists;
- the Impact fragment exists;
- both resolution passes leave no token unresolved;
- the generated outcome is nonblank, grammatical, and semantically legal; and
- Counter authority resolves.

Incomplete planned cells are coverage backlog, not player-facing options. They
remain visible to the audit and do not become legal through Theme, Difficulty,
normalization, Custom Review, or generic scaling.

## Builder Flow

The player-facing order is:

1. Name
2. Narrative Theme
3. Intention
4. Method
5. Outcome Contract
6. Scope
7. Scene Impact
8. Dice Count
9. Counter
10. Additional Restriction

The Outcome Contract list filters by Intention and Method only. Custom Outcome
remains available under existing rules. After a standard contract is selected,
Scope shows only Scopes with at least one completed Impact, in global Scope
order. Impact shows only completed Impacts for that contract and Scope, in
global Impact order.

Contract selection preserves the current Scope when it has a completed cell,
otherwise it selects the first completed Scope. It then preserves the current
Impact when that cell resolves, otherwise it selects the first completed Impact.
Changing Scope retains the contract and applies the same Impact fallback.
Changing Impact retains the contract when the selected cell resolves. An
incompatible Intention or Method clears the standard contract and Counter.
Custom Method and Custom Outcome behaviour is unchanged. Incomplete cells are
not shown as development options.

## Family-Level Privilege Keys

Every family owns exactly one unique privilege key, equal to its stable ID:

- `HIDE_FROM_IMMEDIATE_DANGER`
- `SECURE_IMMEDIATE_SAFETY`
- `DENY_IMMINENT_HOSTILE_ACT`
- `DRAW_HOSTILE_ATTENTION`
- `BREAK_SHARED_RESOLVE`
- `UNCOVER_CONCEALED_TRUTH`
- `REVEAL_EXPLOITABLE_WEAKNESS`
- `SECURE_WILLING_COOPERATION`
- `ESTABLISH_SHARED_RESOLVE`
- `ESTABLISH_FALSE_BELIEF`
- `DIVERT_IMMEDIATE_ATTENTION`

Scope/Impact-suffixed keys are retired as runtime authorities and are not hidden
aliases. No numeric migration is required because no numeric Roleplay privilege
tuning exists. Future costing remains an Impact/Scope economic component plus
the family privilege component, Dice component, Counter component, and later
approved adjustments.

## Current Coverage

The library contains nine Methods and eleven Outcome Contract families. Planned
coverage is every declared supported Scope across all four Impact tiers:

| Contract | Planned Scopes | Completed Impacts |
| --- | --- | --- |
| `HIDE_FROM_IMMEDIATE_DANGER` | One Target, Small Group | Minor for both |
| `SECURE_IMMEDIATE_SAFETY` | One Target, Small Group | Standard for both |
| `DENY_IMMINENT_HOSTILE_ACT` | One Target | Major |
| `DRAW_HOSTILE_ATTENTION` | One Target | All four |
| `BREAK_SHARED_RESOLVE` | One Target, Small Group | All four for both |
| `UNCOVER_CONCEALED_TRUTH` | One Target | All four |
| `REVEAL_EXPLOITABLE_WEAKNESS` | One Target | All four |
| `SECURE_WILLING_COOPERATION` | One Target, Small Group | All four for One Target; Small Group grammar missing |
| `ESTABLISH_SHARED_RESOLVE` | Small Group | All four |
| `ESTABLISH_FALSE_BELIEF` | One Target, Small Group | All four for both |
| `DIVERT_IMMEDIATE_ATTENTION` | One Target, Small Group | Minor for both |

This is 68 planned cells, 43 completed/renderable cells, and 25 known missing
cells. The exact missing breakdown is:

- `HIDE_FROM_IMMEDIATE_DANGER`: 6
- `SECURE_IMMEDIATE_SAFETY`: 6
- `DENY_IMMINENT_HOSTILE_ACT`: 3
- `SECURE_WILLING_COOPERATION` / Small Group: 4
- `DIVERT_IMMEDIATE_ATTENTION`: 6

No missing result is authored by this migration. The forty-three existing
success outcomes and full descriptors remain byte-for-byte regression
authority while the principal progress metric becomes planned, completed, and
missing cells.

## Normalization And Stored State

Legacy migration enumerates completed resolved cells and compares normalized
generated outcomes. Every existing successful migration remains successful.
An incompatible legacy outcome remains Custom Review. Explicit Custom Methods
and Custom Outcomes remain explicit. Missing planned cells are never inferred
as complete.

`RoleplayAbility` stores authoring only. It does not store generated descriptors,
generated success outcomes, Scope tokens, Impact fragments, resolved cells,
family privilege keys, coverage state, or any new composition field. Core,
persistence, Prisma, API, and combat runtime require no shape change.

## Deterministic Coverage Audit

`scripts/roleplayStandardLibrary.audit.ts` is the read-only structural and
coverage authority. Default mode fails structural errors but succeeds when only
known completeness gaps remain, reporting 9 Methods / 11 contracts / 11 keys /
68 planned / 43 completed / 25 missing. `--require-complete` fails while any
planned cell is missing.

The audit reports Method and contract order, supported Scopes, completed Impacts,
missing cells by contract, unresolved tokens, missing Scope fragments, duplicate
IDs/keys/cells, invalid Method ownership, blank outcomes, and Counter-resolution
errors.

## Future Scope Work

Later Self-facing Methods require coherent Self grammar and effect identity;
Self is not unlocked by this migration. Large Group and Faction / Army remain
authorable only after coherent contract-specific Scope support and all required
Impact fragments are written and audited. Empty cells are backlog, not a promise
that generic scaling can safely invent them.

No numeric cost, cooldown, tuning, restriction discount, Prisma field, API
field, calculator behaviour, or combat-runtime mechanic is added here.
