# Roleplay Ability Costing Readiness

Status: LOCKED NON-NUMERIC ARCHITECTURE; NUMERIC IMPLEMENTATION PARKED.

This document is the focused authority for Roleplay Ability costing readiness.
It defines what a future resolver must cost, which authoring can become
structurally eligible, the required order and invariants, the evidence required
for calibration, and the gates that prevent premature pricing.

> Roleplay Ability costing architecture may be specified while numeric Roleplay
> costing remains unavailable pending the whole-system balance baseline.

This specification assigns no numeric cost, cooldown, multiplier, privilege
value, restriction discount, floor, cap, or tuning row. It does not author a
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
Resolve adds the first Self-only family and brings coverage to 72 planned / 72
completed / 0 missing. Declared Personal Course is runtime-only and grants no
mechanical-effect removal or quantified output. Completion approves no numeric
value.

## Current Readiness State

The semantic/discovery phase is mature enough for costing architecture. The
live registry currently contains:

- ten standard Methods;
- twelve standard Outcome Contract families;
- seventy-two planned standard cells;
- seventy-two completed/renderable cells;
- zero missing cells and no current completeness backlog;
- Self, One Target, and Small Group standard coverage;
- no approved Large Group or Faction / Army standard contract; and
- twelve unique family-level `privilegeCostKey` values, one per contract.

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
- Additional Restrictions may reduce final spend only after approval.
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
- restriction discounts; and
- floors, caps, rounding, and level interactions.

The registry owns privilege-key identity, never its numeric value. Numeric
economic values must not be placed in
`lib/characterBuilder/roleplayAbilities.ts`.

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
8. Apply an approved Additional Restriction discount last.
9. Produce Net Potential.
10. Validate against the separate character budget authority.

The symbolic decomposition is:

```text
ImpactScopeBase
+ ContractPrivilegeAdjustment
+ DiceReliabilityAdjustment
+ SelectedCounterAdjustment
= GrossPotential

CooldownBasisPotential = GrossPotential

GrossPotential
+ ApprovedCooldownTradeoffAdjustment
= PreRestrictionPotential

PreRestrictionPotential
- ApprovedAdditionalRestrictionDiscount
= NetPotential
```

No term has a numeric value in this specification. The character's available
budget is not part of the formula. Cost resolution and budget validation are
separate authorities.

## Gross Potential And Net Potential

Gross Potential is unrestricted authored value before any cooldown tradeoff or
Additional Restriction discount. Net Potential is final spend after every
approved adjustment.

Locked invariants:

- Additional Restrictions never lower Gross Potential.
- Additional Restrictions never lower Cooldown Basis Potential.
- Additional Restrictions never produce a shorter derived cooldown.
- Restriction discounts apply last.
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

Baseline cooldown derives from Gross Potential before restrictions. A future
tradeoff might change spend or effective cooldown, but no rule is approved.

Locked protections:

- Restriction discount cannot influence baseline cooldown.
- Net Potential cannot feed back into baseline cooldown derivation.
- An Additional Restriction cannot automatically grant a longer cooldown.
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

The twelve active family privilege keys are unique and equal to the stable
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
- an unresolved restriction discount; or
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

## Additional Restriction Approval

The resolver must not judge free-text restriction quality:

- Restriction prose remains subject to Game Director / Architect judgement.
- A requested band is not proof that a discount is earned.
- An authoritative discount requires an approved restriction classification.
- Without approval, a future resolver may show Gross Potential but cannot claim
  an authoritative discounted Net Potential.
- Writing length, wording, vocabulary, or drama cannot infer severity.
- Intrinsic contract limits cannot be repackaged as paid restrictions.
- Target Eligibility must genuinely narrow existing target rules.
- Final implementation must distinguish requested from approved classification,
  or otherwise expose approval provenance.

The approval workflow and storage model remain OPEN. No approval field is added
by this specification.

## Future Pure Resolver Contract

A future pure resolver receives explicit:

- normalized Roleplay Ability authoring;
- character level or other required economic context;
- exact standard registry state;
- an authoritative versioned Roleplay tuning snapshot;
- approved restriction classification, where applicable;
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
- approved restriction discount;
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
- restriction discount cannot exceed Pre-Restriction Potential;
- Net Potential cannot exceed Pre-Restriction Potential or become negative;
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

- all sixty-eight completed cells, including byte-for-byte regression evidence
  for the forty-three pre-completion descriptors and exact evidence for the
  twenty-five completion descriptors;
- every supported Dice Count;
- Counter off and every legal Counter-on case;
- no Additional Restriction as baseline;
- approved representative restrictions only after restriction doctrine is
  ready;
- low-, middle-, and high-level contexts after level-budget doctrine settles;
- all twelve family `privilegeCostKey` values and every independent Scope/Impact
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
10. Restriction approval and discount authority are defined.
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
- restriction discounts and approval persistence;
- tuning schema and database storage;
- cached cost/cooldown fields;
- migration of existing Roleplay Abilities;
- budget-validation integration; and
- final player-facing terminology.

None of these decisions is resolved by implication. Numeric implementation is
parked until the unlock gates are satisfied.
