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
| `HIDE_FROM_IMMEDIATE_DANGER` | One Target, Small Group | All four for both |
| `SECURE_IMMEDIATE_SAFETY` | One Target, Small Group | All four for both |
| `DENY_IMMINENT_HOSTILE_ACT` | One Target | All four |
| `DRAW_HOSTILE_ATTENTION` | One Target | All four |
| `BREAK_SHARED_RESOLVE` | One Target, Small Group | All four for both |
| `UNCOVER_CONCEALED_TRUTH` | One Target | All four |
| `REVEAL_EXPLOITABLE_WEAKNESS` | One Target | All four |
| `SECURE_WILLING_COOPERATION` | One Target, Small Group | All four for both |
| `ESTABLISH_SHARED_RESOLVE` | Small Group | All four |
| `ESTABLISH_FALSE_BELIEF` | One Target, Small Group | All four for both |
| `DIVERT_IMMEDIATE_ATTENTION` | One Target, Small Group | All four for both |

This is 68 planned cells, 68 completed/renderable cells, and zero missing cells.
Every declared supported Scope exposes Minor, Standard, Major, and Legendary.
There is no current standard-library completeness backlog. The forty-three cells
that predate library completion remain byte-for-byte regression authority; the
twenty-five newly completed cells extend rather than rewrite that baseline.

## Completion Doctrine

The exact completion data is:

- Hide Standard: `becomes hidden from {{dangerReference}} for the rest of the current scene unless an identifiable change defeats that concealment`
- Hide Major: `becomes securely hidden from {{dangerReference}} for the rest of the current scene and remains concealed despite active searching, ordinary suspicion, or serious pressure unless decisive circumstances defeat the concealment`
- Hide Legendary: `becomes hidden from {{dangerReference}} through a defining concealment whose protection extends beyond the current scene until it is decisively exposed or narratively resolved`
- Safety Minor: `is secured from one small immediate peril for the current meaningful exchange and is no longer directly threatened by it during that exchange`
- Safety Major: `is secured from one central immediate peril for the rest of the current scene and remains outside its direct threat despite serious pressure or worsening conditions unless a decisive change defeats the safe state`
- Safety Legendary: `is secured from one defining peril through an enduring safe state whose protection extends beyond the current scene until it is decisively breached or narratively resolved`
- Denial Minor: `one small immediate hostile act the target is about to take is spoiled before it resolves`
- Denial Standard: `the target's current hostile action fails before it resolves`
- Denial Legendary: `the target's defining current or next hostile action fails before it resolves, preventing the defining consequence that action would otherwise establish`
- Cooperation Small Group token: `subject: every accepted member of the selected group`
- Diversion Standard: `long enough for one declared meaningful action or development relevant to the current scene to proceed without {{observationReference}}`
- Diversion Major: `despite serious vigilance, pressure, or competing priorities, long enough for one declared central action or development capable of changing the current scene to proceed without {{observationReference}}`
- Diversion Legendary: `through a defining diversion, long enough for one declared defining action or development whose consequences extend beyond the current scene to proceed without {{observationReference}}`

### Hide From Immediate Danger

Hide retains `becomes hidden from {{dangerReference}}` as its exact Minor
fragment. Standard concealment lasts for the rest of the current scene unless
an identifiable change defeats it. Major concealment withstands active
searching, ordinary suspicion, and serious pressure unless decisive
circumstances defeat it. Legendary concealment is defining, may extend beyond
the current scene, and ends through decisive exposure or Narrative Resolution.

This is concealment from the accepted danger, never invisibility, sensory
immunity, or universal concealment. Every accepted Small Group member receives
the same tier without majority interpretation, hidden exemptions, or separate
resistance. One member may later expose themselves without automatically
exposing the others when the fiction supports individual resolution.

### Secure Immediate Safety

Minor secures the selected Scope from one small immediate peril through the
current meaningful exchange without solving the wider peril. Standard retains
the existing meaningful rescue wording unchanged. Major secures the Scope from
one central peril for the rest of the current scene; serious pressure or
worsening conditions do not defeat it without a decisive change. Legendary
creates a defining safe state that may extend beyond the scene until decisive
breach or Narrative Resolution, never permanent universal immunity.

The same declared peril applies to every accepted target. The purchased safety
requires no additional movement, defence, rescue, or target-action roll. The GD
chooses one coherent full Scene Manifestation; exact squares, routes,
distances, formations, or destinations are not purchased. The peril's source
may remain active and genuinely new dangers remain possible.

### Deny Imminent Hostile Act

Minor spoils one small immediate hostile act without suppressing the target's
turn or broader objective. Standard fails the current hostile action without
Major's current-or-next flexibility. Major retains the existing current-or-next
action wording unchanged. Legendary denies one defining current or next
hostile action and the defining consequence that action would directly
establish.

Every tier remains One Target and Counter-eligible. Denial is not Block, Dodge,
Resist, Cleanse, or Control; it does not reveal a hidden act, cancel unrelated
passive effects or prior consequences, suppress future turns, or erase every
hostile objective. It requires an eligible perceived impending act under the
existing timing doctrine.

### Secure Willing Cooperation: Shared Request

Before Attribute or Difficulty, the player identifies exact members or one
unambiguous bounded set, one shared bounded request, how the Appeal and Theme
reach everyone, and why each member can coherently make that willing choice.
Every accepted member must perceive and understand the request, possess the
required agency, authority, and capability, be individually eligible at the
selected Impact, and be reachable through the same Appeal expression. The GD
narrows, revises, or rejects the group before Difficulty when any member is
ineligible; Difficulty cannot make an ineligible member eligible.

Membership fixes when Difficulty is set. On success every accepted member
willingly accepts and sincerely pursues the same request at the selected Impact.
There is no majority result, hidden exemption, separate resistance, secretly
unwilling member, or post-success narrowing. Members retain individual
judgement, tactics, movement, timing, resource choices, reactions, and unrelated
values. The contract creates neither a shared mind or turn nor identical
execution, competence, task success, or authority the members lack. It cannot
bundle different independent requests, convert Small Group into Large Group or
Faction / Army, or propagate to later arrivals, replacements, followers,
subordinates, organisations, factions, armies, or the public.

### Divert Immediate Attention

Every tier grants only one Declared Opening. Minor retains the existing small
immediate opening unchanged. Standard supports one meaningful action or
development relevant to the current scene. Major supports one central,
potentially scene-changing action or development despite serious vigilance,
pressure, or competing priorities. Legendary supports one defining action or
development whose consequences extend beyond the current scene; the diversion
itself ends when its one accepted opening is used.

The opening grants no extra action and does not guarantee success. Normal
rolls, costs, access, obstacles, tools, observers, defences, and hazards remain.
Diversion creates no false belief or concealment, fails no action, cannot bypass
a direct formal hostile action, permits no Counter, affects only the selected
Scope, and does not persist after the accepted opening is used.

## Normalization And Stored State

Legacy migration enumerates completed resolved cells and compares normalized
generated outcomes. Every existing successful migration remains successful.
An incompatible legacy outcome remains Custom Review. Explicit Custom Methods
and Custom Outcomes remain explicit. Normalization never infers another family
from merely similar wording.

`RoleplayAbility` stores authoring only. It does not store generated descriptors,
generated success outcomes, Scope tokens, Impact fragments, resolved cells,
family privilege keys, coverage state, or any new composition field. Core,
persistence, Prisma, API, and combat runtime require no shape change.

## Deterministic Coverage Audit

`scripts/roleplayStandardLibrary.audit.ts` is the read-only structural and
coverage authority. Default mode and `--require-complete` both report and pass
9 Methods / 11 contracts / 11 keys / 68 planned / 68 completed / 0 missing.

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
