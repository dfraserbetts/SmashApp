# Roleplay Ability Costing Readiness

Status: LOCKED NON-NUMERIC ARCHITECTURE; NUMERIC IMPLEMENTATION PARKED.

This document is the focused authority for Roleplay Ability costing readiness.
It defines what a future resolver must cost, which authoring can become
structurally eligible, the required order and invariants, the evidence required
for calibration, and the gates that prevent premature pricing.

> Roleplay Ability costing architecture may be specified while numeric Roleplay
> costing remains unavailable pending the whole-system balance baseline.

This specification assigns no numeric cost, cooldown, multiplier, privilege
value, Restriction credit, floor, cap, or tuning row. It does not author a
resolver, Builder total, saved cost/cooldown field, tuning schema, or database
workflow.

## Compositional Authority

The focused standard-library authority is
[`roleplay-standard-library.md`](./roleplay-standard-library.md). Exact
Scope/Impact tuple variants and tuple-level privilege keys described later in
this document are superseded migration evidence. The active law is one
family-level key per contract, with Scope and Impact as separate compositional
and future economic components. Outcome Contracts filter by Intention and
Method; completed Scope and Impact availability resolves after selection.
The completed non-numeric library and its Hide, Safety, Denial, shared-request,
and Diversion doctrines remain locked there. Steel Yourself / Sustain Personal
Resolve adds the first Self-only family; Track / Trace Quarry and Prove /
Establish Verified Truth bring coverage to 88 planned / 88 completed / 0 missing. Declared Personal Course, Declared
Quarry are runtime-only and grant no
mechanical-effect removal or quantified output. Completion approves no numeric
value.

## Current Readiness State

The semantic/discovery phase is mature enough for costing architecture. The
live registry currently contains:

- twelve standard Methods;
- fourteen standard Outcome Contract families;
- eighty-eight planned standard cells;
- eighty-eight completed/renderable cells;
- zero missing cells and no current completeness backlog;
- Self, One Target, and Small Group standard coverage;
- no approved Large Group or Faction / Army standard contract; and
- fourteen unique family-level `privilegeCostKey` values, one per contract.

The wider numeric economy is not yet authoritative. Power and Forge costs,
level affordability, cooldown authority, persisted cooldown caches,
reconciliation, benchmarks, and shared-point opportunity costs remain under
whole-system balance examination. Readiness must not become provisional pricing.

Current standard authoring is:

> Structurally costable, numerically unavailable pending balance calibration.

## Semantic Authority And Economic Authority

Roleplay semantics and economics are separate authorities:

- Roleplay Methods define legal approaches.
- Narrative Theme personalises the approach.
- Outcome Contracts define purchased results.
- Scene Impact selects the approved consequence tier.
- Scope defines breadth.
- Dice Count defines reliability.
- Counter adds approved timing flexibility when selected and eligible.
- A future separately authorized Restriction credit may reduce final spend only
  after approval; no numeric credit is authorized now.
- Runtime Difficulty measures the challenge of one eligible scene-specific use.

The semantic registry owns:

- Intention;
- Method;
- Outcome Contract;
- the exact contract variant;
- `privilegeCostKey` identity;
- Counter eligibility; and
- intrinsic examples and exclusions.

Future economic tuning owns:

- Impact/Scope base values;
- privilege adjustments;
- Dice reliability adjustments;
- selected Counter surcharge;
- cooldown curves;
- cooldown tradeoff adjustments;
- Restriction credits; and
- floors, caps, rounding, and level interactions.

The registry owns privilege-key identity, never its numeric value. Numeric
economic values must not be placed in
`lib/characterBuilder/roleplayAbilities.ts`.

## Roleplay Restriction And Power-Burden Boundary

A Roleplay Ability may have zero or one Restriction. A Restriction is one
atomic, enforceable narrative eligibility condition that must already be true
immediately before the Ability is committed. It applies to the whole Ability,
never to an individual Outcome Contract component, Scope, Impact, or other
compositional cell. Multiple or stacked Restrictions are unavailable in V1.

Roleplay uses the shared Restriction authoring model owned by
[`02_Power_System_And_Costing.txt`](./02_Power_System_And_Costing.txt): exactly
Standard Structured, Campaign-Custom Structured, or Custom Narrative. "No
Restriction" is absence, not a fourth mode. The structured path uses the shared
Subject + Condition + Operator + Value grammar and registry; Custom Narrative
uses the player-facing label "Fully Custom — GD Review and Manual Adjudication
Required". Evaluation metadata does not claim current runtime or Combat Lab
support.

The Restriction cannot be created, applied, paid, or revealed by the Ability
whose use it governs. A state created by another Ability may enable it only
after that other Ability completes resolution and the state remains true.
Cross-Ability enabling is legal, but reliable character-controlled or
ally-controlled enabling reduces practical lost availability and therefore
matters to approval and severity.

A Power Burden is either an Activation Cost or Backlash and belongs only to a
Power. A Roleplay Ability receives no Activation Cost, no Backlash, and no
Power-Burden economic credit in V1. Irreversible Sacrifice remains future Limit
Break authority rather than Roleplay authoring.

The normal Roleplay Ability descriptor and its Restriction Descriptor are
separate authorities. The first explains the Ability's operation; the second
explains the pre-existing narrative eligibility condition. Future previews,
character sheets, printable references, and inspection surfaces must render a
Restriction separately instead of splicing its prose into Outcome Contract
grammar. This costing authority itself authorizes no schema, database, resolver,
economic, or runtime implementation.

The `restrictionType`, `restrictionBand`, `restrictionTag`, and `restrictionText`
fields are deprecated transitional migration input only, not the permanent
shared definition, editor, governance, or economic API. Their live controls are
removed. Safe legacy values migrate during ordinary normalization and resolved
saves neutralize the fields; ambiguous values remain visible for deliberate
review and block save. The shared editor now owns Roleplay authoring, semantic
Restrictions round-trip through builderData, and ordinary target grammar derives
only from Scope rather than legacy Target Eligibility. The Restriction descriptor
remains separate and no Restriction changes Roleplay cost.

## Components That Never Directly Change Automatic Cost

These never directly alter automatic Roleplay Ability cost:

- Ability Name;
- Narrative Theme prose;
- writing quality, vocabulary, spelling, grammar, or dramatic flair;
- Declared Aim, Declared Premise, Declared Shared Course, or Declared Opposed Course;
- the exact target or group members selected during play;
- the Attribute selected by the Game Director;
- runtime Difficulty;
- the quality of the player's performance or explanation;
- Outcome Lane by itself;
- Intention by itself; and
- Method identity by itself.

Intention and Method control compatibility but receive no generic independent
surcharge. Help and Hinder are classifications, not price bands. Runtime
Difficulty is chosen after the scene declaration and cannot increase or reduce
character-build cost.

## Locked Structural Cost Order

A future automatic resolver must preserve this order:

1. Resolve exact legal standard authoring.
2. Resolve the Scene Impact / Scope base.
3. Resolve the exact Outcome Contract privilege adjustment.
4. Resolve Dice reliability.
5. Resolve selected Counter surcharge where eligible.
6. Establish Gross Potential and the cooldown basis.
7. Resolve any separately approved cooldown tradeoff.
8. Resolve any approved Restriction credit independently against unrestricted
   Gross Potential.
9. Subtract the approved Restriction credit last.
10. Produce Net Potential.
11. Validate against the separate character budget authority.

The symbolic decomposition is:

```text
ImpactScopeBase
+ ContractPrivilegeAdjustment
+ DiceReliabilityAdjustment
+ SelectedCounterAdjustment
= GrossPotential

CooldownBasisPotential = GrossPotential

RestrictionCreditAnchor = GrossPotential
ApprovedRestrictionCredit = approved classification resolved against
  RestrictionCreditAnchor

GrossPotential
+ ApprovedCooldownTradeoffAdjustment
= PreRestrictionPotential

PreRestrictionPotential
- ApprovedRestrictionCredit
= NetPotential
```

No term has a numeric value in this specification. The character's available
budget is not part of the formula. Cost resolution and budget validation are
separate authorities. "Subtract last" describes final calculation order only.
It does not derive the Restriction credit sequentially from an already adjusted
or reduced subtotal. The credit is independently anchored to unrestricted Gross
Potential before it is subtracted from Pre-Restriction Potential.

## Gross Potential And Net Potential

Gross Potential is unrestricted authored value before any cooldown tradeoff or
Restriction credit. Net Potential is final spend after every approved
adjustment.

Locked invariants:

- Restrictions never lower Gross Potential.
- Restrictions never lower Cooldown Basis Potential.
- Restrictions never produce a shorter derived cooldown.
- Restriction credit magnitude is anchored to unrestricted Gross Potential.
- Restriction credits are subtracted last but are never derived sequentially
  from Pre-Restriction Potential or another reduced subtotal.
- Intrinsic contract boundaries earn no discount.
- Cosmetic wording earns no discount.
- A restriction cannot discount something the contract already forbids.
- Net Potential cannot be negative.
- A restriction cannot erase the economic identity of a non-empty standard
  Ability.

No minimum numeric floor is approved.

## Cooldown Readiness And The Circularity Gate

The earlier phrase "Cooldown adjustment" is not a complete mechanic. Two
different concepts must remain separate:

1. baseline derived cooldown; and
2. a possible future player-authored cooldown tradeoff.

Baseline cooldown derives from Gross Potential before Restrictions. A future
tradeoff might change spend or effective cooldown, but no rule is approved.

Locked protections:

- Restriction credit cannot influence baseline cooldown.
- Net Potential cannot feed back into baseline cooldown derivation.
- A Restriction cannot automatically grant a longer cooldown.
- A lower Net Potential cannot also create a shorter cooldown.
- Cost and cooldown formulas cannot recursively recalculate one another.
- A future cooldown tradeoff operates relative to an already resolved baseline
  through a one-directional calculation.
- No player-selectable Roleplay cooldown control is implemented until that rule
  receives separate approval.

OPEN:

- whether Roleplay cooldown is entirely derived;
- whether players may lengthen cooldown for reduced spend;
- whether players may spend more for a shorter cooldown;
- the permitted adjustment range;
- rounding;
- minimum and maximum cooldown;
- whether Roleplay uses the exact Power curve; and
- whether Roleplay needs persisted cooldown caches.

Roleplay must use the same discipline of explicit authority and provenance as
Powers where applicable. That does not establish numeric curve compatibility.

## Structural Eligibility And Numeric Authority

Structural eligibility asks:

- Is authoring complete?
- Is the Method approved?
- Is the Outcome Contract standard?
- Does an exact Intention / Method / Impact / Scope variant exist?
- Is selected Counter legal?
- Is the required `privilegeCostKey` present?
- Is the Scope supported by that exact variant?

Required conceptual structural distinctions are:

- `READY_FOR_CALIBRATION`
- `INCOMPLETE_AUTHORING`
- `INVALID_AUTHORING`
- `CUSTOM_METHOD_REVIEW_REQUIRED`
- `CUSTOM_OUTCOME_REVIEW_REQUIRED`
- `UNSUPPORTED_STANDARD_COMBINATION`
- `UNSUPPORTED_SCOPE`
- `INVALID_COUNTER_SELECTION`
- `MISSING_PRIVILEGE_KEY`
- `RESTRICTION_REVIEW_REQUIRED`

These distinctions are locked; exact future TypeScript enum names are not.

Numeric authority independently asks:

- Does an approved, versioned Roleplay tuning snapshot exist?
- Is every required component and privilege key calibrated?
- Is cooldown doctrine approved?
- Is restriction approval available where needed?
- Has the whole-system economic baseline been accepted?

An Ability may be structurally eligible while numeric authority is unavailable.
That is the expected current state. Missing numeric authority returns no
authoritative number, not a provisional number or zero.

## Active Family Privilege Inventory

The fourteen active family privilege keys are unique and equal to the stable
contract IDs:

| Outcome Contract | Family `privilegeCostKey` |
| --- | --- |
| `HIDE_FROM_IMMEDIATE_DANGER` | `HIDE_FROM_IMMEDIATE_DANGER` |
| `SECURE_IMMEDIATE_SAFETY` | `SECURE_IMMEDIATE_SAFETY` |
| `DENY_IMMINENT_HOSTILE_ACT` | `DENY_IMMINENT_HOSTILE_ACT` |
| `DRAW_HOSTILE_ATTENTION` | `DRAW_HOSTILE_ATTENTION` |
| `BREAK_SHARED_RESOLVE` | `BREAK_SHARED_RESOLVE` |
| `UNCOVER_CONCEALED_TRUTH` | `UNCOVER_CONCEALED_TRUTH` |
| `REVEAL_EXPLOITABLE_WEAKNESS` | `REVEAL_EXPLOITABLE_WEAKNESS` |
| `TRACE_QUARRY` | `TRACE_QUARRY` |
| `ESTABLISH_VERIFIED_TRUTH` | `ESTABLISH_VERIFIED_TRUTH` |
| `SECURE_WILLING_COOPERATION` | `SECURE_WILLING_COOPERATION` |
| `ESTABLISH_SHARED_RESOLVE` | `ESTABLISH_SHARED_RESOLVE` |
| `SUSTAIN_PERSONAL_RESOLVE` | `SUSTAIN_PERSONAL_RESOLVE` |
| `ESTABLISH_FALSE_BELIEF` | `ESTABLISH_FALSE_BELIEF` |
| `DIVERT_IMMEDIATE_ATTENTION` | `DIVERT_IMMEDIATE_ATTENTION` |

Future costing combines a family privilege component with separate Scope,
Impact, Dice, Counter, and later approved adjustment components. No numeric
values are assigned.

## Superseded Exact-Cell Migration Inventory

The rows below preserve the forty-three pre-composition cells as descriptor and
migration evidence. Their Scope/Impact-suffixed `privilegeCostKey` column is
retired historical data, not runtime authority or a hidden alias. Structural
readiness now comes from compositional cell resolution and the family table
above.

| Intention | Method | Outcome Contract | Impact | Scope | Counter | `privilegeCostKey` | Structural readiness |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Intervention | Rescue | `HIDE_FROM_IMMEDIATE_DANGER` | Minor | One Target | Unavailable | `HIDE_FROM_IMMEDIATE_DANGER` | Ready for calibration |
| Intervention | Rescue | `HIDE_FROM_IMMEDIATE_DANGER` | Minor | Small Group | Unavailable | `HIDE_FROM_IMMEDIATE_DANGER_SMALL_GROUP` | Ready for calibration |
| Intervention | Rescue | `SECURE_IMMEDIATE_SAFETY` | Standard | One Target | Unavailable | `SECURE_IMMEDIATE_SAFETY` | Ready for calibration |
| Intervention | Rescue | `SECURE_IMMEDIATE_SAFETY` | Standard | Small Group | Unavailable | `SECURE_IMMEDIATE_SAFETY_SMALL_GROUP` | Ready for calibration |
| Intervention | Interrupt | `DENY_IMMINENT_HOSTILE_ACT` | Major | One Target | Eligible | `DENY_IMMINENT_HOSTILE_ACT` | Ready for calibration |
| Intimidation | Challenge | `DRAW_HOSTILE_ATTENTION` | Minor | One Target | Unavailable | `DRAW_HOSTILE_ATTENTION_MINOR` | Ready for calibration |
| Intimidation | Challenge | `DRAW_HOSTILE_ATTENTION` | Standard | One Target | Unavailable | `DRAW_HOSTILE_ATTENTION_STANDARD` | Ready for calibration |
| Intimidation | Challenge | `DRAW_HOSTILE_ATTENTION` | Major | One Target | Unavailable | `DRAW_HOSTILE_ATTENTION_MAJOR` | Ready for calibration |
| Intimidation | Challenge | `DRAW_HOSTILE_ATTENTION` | Legendary | One Target | Unavailable | `DRAW_HOSTILE_ATTENTION_LEGENDARY` | Ready for calibration |
| Intimidation | Overawe | `BREAK_SHARED_RESOLVE` | Minor | One Target | Unavailable | `BREAK_SHARED_RESOLVE_ONE_TARGET_MINOR` | Ready for calibration |
| Intimidation | Overawe | `BREAK_SHARED_RESOLVE` | Standard | One Target | Unavailable | `BREAK_SHARED_RESOLVE_ONE_TARGET_STANDARD` | Ready for calibration |
| Intimidation | Overawe | `BREAK_SHARED_RESOLVE` | Major | One Target | Unavailable | `BREAK_SHARED_RESOLVE_ONE_TARGET_MAJOR` | Ready for calibration |
| Intimidation | Overawe | `BREAK_SHARED_RESOLVE` | Legendary | One Target | Unavailable | `BREAK_SHARED_RESOLVE_ONE_TARGET_LEGENDARY` | Ready for calibration |
| Intimidation | Overawe | `BREAK_SHARED_RESOLVE` | Minor | Small Group | Unavailable | `BREAK_SHARED_RESOLVE_MINOR` | Ready for calibration |
| Intimidation | Overawe | `BREAK_SHARED_RESOLVE` | Standard | Small Group | Unavailable | `BREAK_SHARED_RESOLVE_STANDARD` | Ready for calibration |
| Intimidation | Overawe | `BREAK_SHARED_RESOLVE` | Major | Small Group | Unavailable | `BREAK_SHARED_RESOLVE_MAJOR` | Ready for calibration |
| Intimidation | Overawe | `BREAK_SHARED_RESOLVE` | Legendary | Small Group | Unavailable | `BREAK_SHARED_RESOLVE_LEGENDARY` | Ready for calibration |
| Perception | Discern Truth | `UNCOVER_CONCEALED_TRUTH` | Minor | One Target | Unavailable | `UNCOVER_CONCEALED_TRUTH_MINOR` | Ready for calibration |
| Perception | Discern Truth | `UNCOVER_CONCEALED_TRUTH` | Standard | One Target | Unavailable | `UNCOVER_CONCEALED_TRUTH_STANDARD` | Ready for calibration |
| Perception | Discern Truth | `UNCOVER_CONCEALED_TRUTH` | Major | One Target | Unavailable | `UNCOVER_CONCEALED_TRUTH_MAJOR` | Ready for calibration |
| Perception | Discern Truth | `UNCOVER_CONCEALED_TRUTH` | Legendary | One Target | Unavailable | `UNCOVER_CONCEALED_TRUTH_LEGENDARY` | Ready for calibration |
| Perception | Discern Truth | `REVEAL_EXPLOITABLE_WEAKNESS` | Minor | One Target | Unavailable | `REVEAL_EXPLOITABLE_WEAKNESS_MINOR` | Ready for calibration |
| Perception | Discern Truth | `REVEAL_EXPLOITABLE_WEAKNESS` | Standard | One Target | Unavailable | `REVEAL_EXPLOITABLE_WEAKNESS_STANDARD` | Ready for calibration |
| Perception | Discern Truth | `REVEAL_EXPLOITABLE_WEAKNESS` | Major | One Target | Unavailable | `REVEAL_EXPLOITABLE_WEAKNESS_MAJOR` | Ready for calibration |
| Perception | Discern Truth | `REVEAL_EXPLOITABLE_WEAKNESS` | Legendary | One Target | Unavailable | `REVEAL_EXPLOITABLE_WEAKNESS_LEGENDARY` | Ready for calibration |
| Persuasion | Appeal | `SECURE_WILLING_COOPERATION` | Minor | One Target | Unavailable | `SECURE_WILLING_COOPERATION_MINOR` | Ready for calibration |
| Persuasion | Appeal | `SECURE_WILLING_COOPERATION` | Standard | One Target | Unavailable | `SECURE_WILLING_COOPERATION_STANDARD` | Ready for calibration |
| Persuasion | Appeal | `SECURE_WILLING_COOPERATION` | Major | One Target | Unavailable | `SECURE_WILLING_COOPERATION_MAJOR` | Ready for calibration |
| Persuasion | Appeal | `SECURE_WILLING_COOPERATION` | Legendary | One Target | Unavailable | `SECURE_WILLING_COOPERATION_LEGENDARY` | Ready for calibration |
| Persuasion | Rally | `ESTABLISH_SHARED_RESOLVE` | Minor | Small Group | Unavailable | `ESTABLISH_SHARED_RESOLVE_MINOR` | Ready for calibration |
| Persuasion | Rally | `ESTABLISH_SHARED_RESOLVE` | Standard | Small Group | Unavailable | `ESTABLISH_SHARED_RESOLVE_STANDARD` | Ready for calibration |
| Persuasion | Rally | `ESTABLISH_SHARED_RESOLVE` | Major | Small Group | Unavailable | `ESTABLISH_SHARED_RESOLVE_MAJOR` | Ready for calibration |
| Persuasion | Rally | `ESTABLISH_SHARED_RESOLVE` | Legendary | Small Group | Unavailable | `ESTABLISH_SHARED_RESOLVE_LEGENDARY` | Ready for calibration |
| Deception | Misdirect | `ESTABLISH_FALSE_BELIEF` | Minor | One Target | Unavailable | `ESTABLISH_FALSE_BELIEF_MINOR` | Ready for calibration |
| Deception | Misdirect | `ESTABLISH_FALSE_BELIEF` | Standard | One Target | Unavailable | `ESTABLISH_FALSE_BELIEF_STANDARD` | Ready for calibration |
| Deception | Misdirect | `ESTABLISH_FALSE_BELIEF` | Major | One Target | Unavailable | `ESTABLISH_FALSE_BELIEF_MAJOR` | Ready for calibration |
| Deception | Misdirect | `ESTABLISH_FALSE_BELIEF` | Legendary | One Target | Unavailable | `ESTABLISH_FALSE_BELIEF_LEGENDARY` | Ready for calibration |
| Deception | Misdirect | `ESTABLISH_FALSE_BELIEF` | Minor | Small Group | Unavailable | `ESTABLISH_FALSE_BELIEF_SMALL_GROUP_MINOR` | Ready for calibration |
| Deception | Misdirect | `ESTABLISH_FALSE_BELIEF` | Standard | Small Group | Unavailable | `ESTABLISH_FALSE_BELIEF_SMALL_GROUP_STANDARD` | Ready for calibration |
| Deception | Misdirect | `ESTABLISH_FALSE_BELIEF` | Major | Small Group | Unavailable | `ESTABLISH_FALSE_BELIEF_SMALL_GROUP_MAJOR` | Ready for calibration |
| Deception | Misdirect | `ESTABLISH_FALSE_BELIEF` | Legendary | Small Group | Unavailable | `ESTABLISH_FALSE_BELIEF_SMALL_GROUP_LEGENDARY` | Ready for calibration |
| Deception | Distract | `DIVERT_IMMEDIATE_ATTENTION` | Minor | One Target | Unavailable | `DIVERT_IMMEDIATE_ATTENTION` | Ready for calibration |
| Deception | Distract | `DIVERT_IMMEDIATE_ATTENTION` | Minor | Small Group | Unavailable | `DIVERT_IMMEDIATE_ATTENTION_SMALL_GROUP` | Ready for calibration |

## Current Automatic-Costing Boundary

Authoritative automatic numeric costing is currently unavailable for every
Roleplay Ability because an approved numeric authority does not yet exist.
Structural readiness can still be determined for the standard rows above.

Automatic numeric costing must remain unavailable for:

- an Unselected Method;
- an Unselected Outcome Contract;
- Custom Method;
- Custom Outcome;
- incompatible standard authoring;
- Self without a completed standard cell;
- Large Group;
- Faction / Army;
- a future completed cell whose family privilege or Scope/Impact components are
  missing or uncalibrated;
- an unresolved Restriction approval or credit; or
- a missing authoritative tuning snapshot.

A Scope appearing in a global dropdown does not make it costable. Support comes
from a fully resolved compositional standard cell.

## Outcome Contract Privilege Authority

- The contract registry owns key identity.
- Future versioned tuning owns key value.
- The resolver performs an exact key lookup.
- The Builder never hardcodes privilege values.
- Help and Hinder never replace exact-key pricing.
- Similar wording does not imply identical privilege value.
- Missing tuning for a required key is blocking and never resolves to zero.
- Duplicate or conflicting tuning authority is invalid.
- Orphan tuning keys must be reported.
- Changing contract prose without reviewing its privilege key triggers economic
  review.

## Dice Reliability Readiness

- Dice Count prices reliability, not outcome magnitude.
- Increasing Dice Count cannot reduce Gross Potential or cooldown pressure.
- Dice Count never changes contract wording.
- Attribute die size is selected through scene judgement and is not stored as a
  Roleplay cost component.
- Runtime Difficulty is not a Dice Count discount.
- Dice pricing need not be linear; its marginal curve remains calibration work.

The supported authored Dice Counts remain 1-5. This is an authoring inventory,
not a pricing curve.

## Counter Readiness

- Counter eligibility alone does not charge a surcharge.
- A surcharge applies only when Counter is selected.
- Counter may be selected only when the exact variant permits it.
- Selecting Counter cannot reduce Gross Potential, Net Potential, or cooldown
  pressure.
- Clearing or invalidating the contract clears Counter.
- Counter is added flexibility, not a Counter-only use restriction.

The current live registry permits Counter only for
`DENY_IMMINENT_HOSTILE_ACT`. No surcharge value is approved.

## Restriction Approval Lifecycle

The conceptual approval lifecycle is locked:

1. Draft.
2. Pending Game Director Approval.
3. Approved.
4. Changes Requested.
5. Approval Stale.

The pure domain keys are `DRAFT`, `PENDING_GD_APPROVAL`, `APPROVED`,
`CHANGES_REQUESTED`, and `APPROVAL_STALE`; a later persistence enum may follow
repository conventions, but Changes Requested is the primary player-facing
label. Draft may be saved for future Builder work but grants no credit and is
not active approved character-sheet authority.
Pending has been submitted for review but grants no credit and cannot be treated
as finalized. Approved means an authenticated Game Director approved the exact
semantic definition represented by its fingerprint. Changes Requested grants no
credit, must be revised or removed, and requires a Player-facing review note.
Approval Stale means the approved definition fingerprint no longer matches and
requires review before approved authority can be claimed.

The semantic Restriction definition, governance record, and any future economic
classification are separate. Player selection and free text cannot approve
themselves, and the client cannot manufacture approval. Provenance should record
lifecycle state, approved-definition fingerprint, submitted/reviewed times,
authenticated reviewer, and review note. Direct edits to the approved
semantic definition stale approval.

Roleplay uses the same ordered classification as Player Powers and Signature
Moves: `MATERIAL_LIMITATION` / Material Limitation,
`SUBSTANTIAL_LIMITATION` / Substantial Limitation,
`NARROW_AVAILABILITY` / Narrow Availability, and `OATH_LIMITATION` / Oath
Limitation. No Restriction is absence. Standard Structured and Fully Custom use
the same qualification standard. Material removes use in a recurring plausible
class of scenes; Substantial removes use across a broad strategically relevant
context or requires consequential setup; Narrow is normally unavailable except
under circumstances players/allies cannot routinely arrange; Oath is expected
to become eligible only approximately two or three times across an entire
campaign and must carry defining narrative consequence plus mechanical scarcity
under explicit GD prevalence/enforceability judgement. Dramatic wording alone,
cosmetic conditions, or routine enabling do not qualify.

Roleplay records the selected tier and approval provenance but receives no
numeric credit until Roleplay numeric costing exists. The Player Power
10%/20%/30% rates, 1 BPV floor, and 0.5 BPV rounding are not Roleplay Potential
values and must not be copied into a Roleplay resolver. Monster Restrictions
remain outside the Player tier system and receive no numeric credit.

Valid unrestricted Roleplay content needs no Restriction approval for print.
Restricted Roleplay content is print-eligible only while current Approved;
Draft, Pending, Changes Requested, Approval Stale, malformed, unresolved legacy,
and missing-governance content is omitted from the future table-ready projection.
Approved Roleplay is print-eligible despite unavailable economics. The actual
pre-budget Print Mode projection, warning/count UI, readiness persistence, and
approval workflow remain deferred.

Whether a GD may approve a Restriction on their own Player Character, whether
broader non-Restriction character-build edits stale approval, and whether
reliable-enabler or wider-context changes automatically stale approval remain
unresolved. Reliable player/party enabling may inform a future economic review
but does not automatically invalidate the Restriction under this authoring lock.

The resolver must not judge free-text Restriction quality:

- A structurally valid Restriction does not automatically earn meaningful
  credit.
- A requested band is not proof that credit is earned.
- Authoritative credit requires an Approved classification with valid
  provenance.
- Without approval, a future resolver may show Gross Potential but cannot claim
  an authoritative credited Net Potential.
- Writing length, wording, vocabulary, or drama cannot infer severity.
- Intrinsic contract limits cannot be repackaged as credited Restrictions.
- Target Eligibility must genuinely narrow existing target rules.

The Restriction Descriptor remains separate from the normal Ability descriptor
through draft, review, approval, and presentation. Legacy Roleplay fields and
any prototype `restrictionDiscountPercent` field are migration input rather
than permanent shared architecture, provenance, or numeric authority. Their
presence proves neither approval nor credit.

The fingerprint contract is locked in the shared authority: schema version,
mode, template key/version, normalized parameters or Custom Narrative text, and
campaign-value identity are semantic inputs; lifecycle, reviewer/timestamps,
notes, UI state, descriptor-only formatting, and future economics are excluded.
Complete standard-template inventory, governance persistence and server
endpoints, Campaign-Custom authoring, Phase 6 surface polish and migration
diagnostics, and numeric Roleplay credits remain later work. The pure shared
lifecycle/tier/readiness/print policy exists, but this specification adds no
approval field, schema, database workflow, active economic resolver, Print Mode
filter, or runtime behaviour.

## Future Pure Resolver Contract

A future pure resolver receives explicit:

- normalized Roleplay Ability authoring;
- character level or other required economic context;
- exact standard registry state;
- an authoritative versioned Roleplay tuning snapshot;
- approved Restriction classification, lifecycle state, provenance, and matching
  normalized fingerprint, where applicable;
- explicit authority mode; and
- budget context only where cooldown derivation requires it.

It must not:

- read the database directly;
- mutate the Ability or tuning;
- infer approval from free text;
- silently use built-in numeric defaults;
- fetch current tuning internally;
- depend on React or the Builder page; or
- duplicate formulas in consumers.

Its conceptual output contains:

- structural eligibility status;
- numeric authority status;
- exact standard variant;
- `privilegeCostKey`;
- component decomposition;
- Gross Potential;
- Cooldown Basis Potential;
- cooldown authority result;
- optional approved cooldown adjustment;
- Pre-Restriction Potential;
- Gross-Potential Restriction credit anchor;
- approved Restriction credit;
- Net Potential;
- warnings and blocking reasons;
- tuning provenance; and
- authority mode/version.

This is a conceptual contract, not a TypeScript interface added in this pass.

## Authority And Provenance

Future numeric Roleplay costing requires:

- one authoritative resolver;
- one explicit versioned tuning source;
- no hidden fallback to seed or built-in values;
- preview and save paths that identify their authority;
- blocking authoritative calculation when active tuning is missing;
- tuning-set identity and updated timestamp on every calculation;
- any future stored cache treated as a non-authoritative derivative;
- current authority capable of detecting stale cached values; and
- read-only reconciliation unless a separate mutation workflow is approved.

> Roleplay may reuse shared authority infrastructure only where semantic and
> economic compatibility is proven. Similar architecture is not proof of
> identical calibration.

This does not require the current Power resolver or Power cooldown curve. No
Roleplay cache or reconciliation tool is approved here.

## Future Hard Invariants

For otherwise identical supported authoring:

- increasing Impact cannot lower Gross Potential;
- increasing Impact cannot lower Net Potential before comparing different
  restrictions;
- increasing Impact cannot reduce cooldown pressure;
- increasing Dice Count cannot lower Gross Potential or cooldown pressure;
- selecting Counter cannot lower Gross Potential or cooldown pressure;
- adding a restriction cannot change Gross Potential or Cooldown Basis
  Potential;
- approved Restriction credit is independently anchored to Gross Potential and
  cannot exceed Gross Potential or Pre-Restriction Potential;
- Net Potential cannot exceed Pre-Restriction Potential or become negative;
- a direct semantic Restriction-definition change invalidates its approval and
  any future credit until reapproval; broader-context staleness follows only a
  separately approved future policy;
- Name and Narrative Theme changes alter no cost component;
- unsupported or custom authoring receives no authoritative numeric result;
- missing tuning never becomes zero; and
- identical input and tuning snapshot always produce identical output.

Scope monotonicity requires a normalized or synthetic anchor. Comparing
`SECURE_WILLING_COOPERATION` directly with `ESTABLISH_SHARED_RESOLVE` cannot
prove a Small Group multiplier because their privileges differ. Scope
calibration must isolate breadth from contract semantics.

## Minimum Calibration Evidence Matrix

Future evidence must cover:

- all eighty-eight completed cells, including byte-for-byte regression evidence
  for the forty-three pre-completion descriptors, exact evidence for the
  twenty-five completion descriptors that formed the earlier sixty-eight-cell
  baseline, and exact evidence for the later twenty cells;
- every supported Dice Count;
- Counter off and every legal Counter-on case;
- no Restriction as baseline;
- approved representative restrictions only after restriction doctrine is
  ready;
- low-, middle-, and high-level contexts after level-budget doctrine settles;
- all fourteen family `privilegeCostKey` values and every independent Scope/Impact
  component;
- exact decomposition;
- monotonicity and deterministic output;
- missing-tuning failure;
- invalid, Custom, and unsupported states;
- synthetic Scope comparisons that isolate breadth; and
- meaningful shared-point-economy opportunity costs.

Narrative outcomes are not converted into wounds, damage, Control stacks,
movement, defence bonuses, or other Power quantities they do not grant.
Calibration compares opportunity cost and scene leverage without claiming false
mechanical equivalence.

## Track / Trace Quarry Readiness

`TRACK` / Track and `TRACE_QUARRY` / Trace Quarry are structurally complete
without numeric authority. The Help family owns `TRACE_QUARRY`, supports One
Target and Small Group at all four Impacts, and is Counter-ineligible throughout.
Its Scope tokens and exact Impact fragments compose eight complete outcomes and
descriptors. The current library therefore contains 12 Methods, 14 contracts,
14 unique family keys, 88 planned cells, 88 completed cells, and zero missing.

Track's target-access exception, runtime Declared Quarry, binding true-trail
result, permission for a previously unspecified coherent trace, normal-travel
boundary, Small Group shared-trail doctrine, and Narrative Resolution define
semantic eligibility. They do not add economic inputs. Quarry identity,
membership, starting connection, trail/trace, last-known location, objective,
route, direction, signature, and pursuit state are runtime-only and are never
stored or priced.

Legacy Perception `specific: "TRACK"` without explicit methodId may migrate to
Track and matching resolved legacy outcomes may migrate to TRACE_QUARRY.
Explicit Custom Track remains Custom, as do SEARCH, INVESTIGATE, SENSE_DANGER,
READ_INTENT, HUNT, and LOCATE. This family adds no provisional cost, zero,
multiplier, cooldown, tuning row, Restriction credit, Builder total,
API/Prisma field, database migration, measured movement, or combat-runtime
tracking state. Numeric costing remains locked behind every gate below.

## Prove / Establish Verified Truth Readiness

`PROVE` / Prove and `ESTABLISH_VERIFIED_TRUTH` / Establish Verified Truth are
structurally complete without numeric authority. The Help family owns one key,
supports One Target and Small Group at all four Impacts, and is Counter-
ineligible throughout. Its Scope tokens and exact fragments compose eight
complete outcomes and descriptors. The current library contains 12 Methods, 14
contracts, 14 family keys, 88 planned cells, 88 completed cells, and zero
missing.

Declared Truth, audience eligibility, binding recognition, coherent supporting
Scene Manifestation, group-wide recognition, and Narrative Resolution are
semantic authority, not economic inputs. Truth claims, proof/evidence,
evidentiary basis, audience, subject, supporting detail, and conclusion remain
runtime-only and are never stored or priced.

Legacy Perception `specific: "PROVE"` without methodId may migrate to Prove and
matching outcomes may migrate to ESTABLISH_VERIFIED_TRUTH. Explicit Custom
Prove and REVELATION, EXPOSE, DEMONSTRATE, PRESENT_EVIDENCE, CONVINCE, and
TESTIFY remain Custom. No provisional number, zero, multiplier, cooldown,
tuning row, discount, Builder total, API/Prisma field, database migration, or
combat-runtime proof state is introduced. Numeric costing remains locked behind
every gate below.

## Numeric Unlock Gates

Numeric Roleplay costing must not begin until every gate is explicitly met:

1. Whole-system balance reaches an accepted economic baseline.
2. Level and point-budget scaling doctrine is settled.
3. Required shared Power/Forge cost assumptions are stable.
4. Current cooldown authority and reconciliation work is stable.
5. Roleplay versus Power shared-point opportunity cost is confirmed.
6. Cooldown tradeoff circularity is resolved.
7. Roleplay tuning ownership and provenance are defined.
8. Every family `privilegeCostKey` and required Scope/Impact component is
   calibrated.
9. Scope calibration exists independently of contract semantics.
10. Restriction approval implementation, persistence, classification, and
    numeric credit authority are defined.
11. Required deterministic smoke and benchmark coverage is designed.
12. The user / Chief Balance authority explicitly approves numeric
    implementation.

Until then there are no provisional numbers, placeholder zeroes, temporary
multipliers, Builder totals, budget enforcement, or authoritative cooldown
displays.

## Explicitly Deferred Decisions

OPEN:

- all numeric values;
- the Impact/Scope matrix;
- One Target versus Small Group multiplier;
- Self, Large Group, and Faction / Army costing;
- Dice marginal curve;
- Counter surcharge;
- every privilege adjustment;
- cooldown curve and cooldown tradeoff;
- cooldown floors/caps;
- level dependence and rounding;
- complete Restriction template inventory, economic classifications, severity
  bands, numeric credits, future enum names, exact fingerprint serialization,
  storage formats, and approval persistence implementation;
- tuning schema and database storage;
- cached cost/cooldown fields;
- Phase 6 migration diagnostics and deliberate disposition of unresolved legacy
  Roleplay data;
- budget-validation integration; and
- final player-facing terminology.

None of these decisions is resolved by implication. Numeric implementation is
parked until the unlock gates are satisfied.
