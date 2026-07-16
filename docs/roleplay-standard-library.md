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
7. Counter and the optional shared Restriction remain separate permissions.

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

Restrictions never replace the normal target phrase or rewrite Scope/Outcome
Contract grammar. A separate Restriction descriptor states any additional
eligibility condition; the ordinary descriptor continues to use the global
Scope targeting component.

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
10. Restriction (optional shared editor)

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
- `TRACE_QUARRY`
- `ESTABLISH_VERIFIED_TRUTH`
- `SECURE_WILLING_COOPERATION`
- `ESTABLISH_SHARED_RESOLVE`
- `SUSTAIN_PERSONAL_RESOLVE`
- `ESTABLISH_FALSE_BELIEF`
- `DIVERT_IMMEDIATE_ATTENTION`

Scope/Impact-suffixed keys are retired as runtime authorities and are not hidden
aliases. No numeric migration is required because no numeric Roleplay privilege
tuning exists. Future costing remains an Impact/Scope economic component plus
the family privilege component, Dice component, Counter component, and later
approved adjustments.

## Current Coverage

The library contains twelve Methods and fourteen Outcome Contract families. Planned
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
| `TRACE_QUARRY` | One Target, Small Group | All four for both |
| `ESTABLISH_VERIFIED_TRUTH` | One Target, Small Group | All four for both |
| `SECURE_WILLING_COOPERATION` | One Target, Small Group | All four for both |
| `ESTABLISH_SHARED_RESOLVE` | Small Group | All four |
| `SUSTAIN_PERSONAL_RESOLVE` | Self | All four |
| `ESTABLISH_FALSE_BELIEF` | One Target, Small Group | All four for both |
| `DIVERT_IMMEDIATE_ATTENTION` | One Target, Small Group | All four for both |

This is 88 planned cells, 88 completed/renderable cells, and zero missing cells.
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

## Steel Yourself And Sustain Personal Resolve

`STEEL_YOURSELF` / Steel Yourself is the first Self-facing standard Method. It
belongs to Persuasion and sits after Rally in Method order. Its exact definition
is: "Strengthen your own resolve by deliberately invoking a personal purpose,
value, promise, duty, identity, hope, memory, training, ritual, or acceptance of
the stakes."

Its illustrative legal approaches are:

- Recall a person, promise, oath, value, or cause that matters
- Focus on one clear immediate purpose
- Repeat a mantra, prayer, ritual, or trained mental discipline
- Acknowledge fear, pain, exhaustion, or doubt without surrendering the chosen course
- Reframe hardship as a chosen cost or sacrifice
- Anchor yourself in identity, duty, hope, love, or responsibility
- Accept the stakes and consciously choose to continue
- Draw strength from a previous hardship, failure, victory, or lesson

Approaches are illustrative rather than exhaustive. Steel Yourself does not
target or bind another character; rely on deliberate self-deception or a false
premise; use supernatural domination; erase fear, doubt, pain, exhaustion,
temptation, memory, or emotion; remove quantified effects or Injury; restore
Health, resources, Attributes, or spent abilities; grant an action, Response,
movement, bonus, immunity, or another quantified Power output; create missing
capability, access, authority, equipment, or resources; make an impossible
course possible; guarantee success; create permanent immunity to adversity;
bypass a mechanical prohibition; or let Difficulty or Legendary Impact
legalise an impossible, incoherent, or overbroad course.

### Persuasion Distinctions

Appeal persuades one target or accepted Small Group to agree willingly to one
request by connecting it to their values, interests, relationships, duties,
emotions, or understanding. Rally unites an accepted Small Group around one
shared course that all accepted members can pursue. Steel Yourself is Self only
and strengthens the character's sincere resolve around one personal course; it
does not persuade, command, coordinate, or bind anyone else.

`ESTABLISH_SHARED_RESOLVE` creates a positive group course and does not apply to
Self through Rally. `SUSTAIN_PERSONAL_RESOLVE` establishes or sustains the
character's own personal course and creates neither group coordination nor
another character's cooperation. Cleanse, Resist, and Powers remove, resist, or
quantify mechanical effects under their own rules; Steel Yourself does not
remove or suppress Fear, Control, conditions, Injury, or another quantified
effect. Blaze of Glory restores Attributes/resources and grants an immediate
final turn before death; Sustain Personal Resolve grants none of those effects.

### Contract And Exact Impact Fragments

`SUSTAIN_PERSONAL_RESOLVE` / Sustain Personal Resolve is Help,
Persuasion / Steel Yourself, Self only, Counter-ineligible, and owns the one
family key `SUSTAIN_PERSONAL_RESOLVE`. It composes `{{impact}}` with an empty
Self token map and these exact fragments:

- Minor: `you steady yourself around one small immediate personal course and sincerely pursue it through the current meaningful exchange despite ordinary fear, doubt, discomfort, or hesitation`
- Standard: `you commit yourself to one clear personal course for the rest of the current scene and sincerely pursue it despite meaningful fear, exhaustion, doubt, temptation, or pressure`
- Major: `you hold to one difficult personal course for the rest of the current scene and sincerely pursue it despite serious fear, exhaustion, personal cost, temptation, or danger unless decisive circumstances or narrative resolution make that course no longer coherent`
- Legendary: `you form one defining personal resolve, oath, or purpose whose consequences extend beyond the current scene and sincerely uphold it until it is fulfilled or narratively resolved`

Self uses the global descriptor form `Roll X dice.` with no Choose clause.

### Declared Personal Course

Before Attribute or Difficulty, the player identifies one exact personal course,
why the character is struggling to continue or hold to it, how Steel Yourself
and Narrative Theme reinforce it, and how it fits the selected Impact. This
runtime declaration is the **Declared Personal Course**.

It must be one coherent, recognisable course within the character's agency,
actual capability, access, and current fiction; fit the selected Impact; concern
the current exchange, scene, or an Impact-appropriate continuing purpose; be
plausibly supported by Method and Theme; and not bundle independent goals. The
GD rejects or narrows an impossible, bundled, overbroad, inaccessible, or
incoherent course before Difficulty. Difficulty cannot legalise an invalid
course.

Valid examples include continuing a rescue until civilians are clear, crossing
a dangerous chamber to reach a trapped witness, giving truthful testimony
despite threats, holding a gate until evacuation is complete, delivering a
message through pursuit, refusing to abandon a named companion in the current
crisis, or upholding a defining promise beyond the scene. Invalid examples
include succeeding at everything, never feeling fear, ignoring mechanical
restrictions, becoming immune to Control, gaining another turn, moving any
distance, overcoming an impossible barrier, completing every party objective,
never needing recovery, becoming incapable of doubt, or bundling unrelated
courses.

Declared Personal Course is runtime terminology only and adds no stored field.

### Binding Result And Player Agency

On success the character genuinely treats the accepted course as a personal
priority and makes a sincere good-faith effort to pursue it without casually
abandoning it because of adversity covered by the selected Impact. No second
roll establishes the resolve. The GD cannot reduce success to feeling slightly
better or cancel it because it disrupts the planned scene.

The player retains authority over tactics, route, normal timing, resources,
responses to new information, unexpected developments, and unrelated values,
relationships, and priorities. The result guarantees neither competence,
survival, access, movement, action availability, completion, nor success of any
roll. Because the player authored the course voluntarily, the result binds the
character's fictional resolve without removing player agency; the player
portrays sincere pursuit or identifies legitimate Narrative Resolution.

Minor covers one small immediate course through the current meaningful
exchange and ordinary fear, doubt, discomfort, or hesitation. Standard covers
one clear scene-long course and meaningful fear, exhaustion, doubt, temptation,
or pressure. Major covers one difficult scene-long course and serious fear,
exhaustion, cost, temptation, or danger, but may resolve when decisive
circumstances make it impossible or incoherent. Legendary is one defining
resolve, oath, or purpose extending beyond the scene until fulfilled or
narratively resolved; it grants no permanent immunity, survival, or endless
endurance.

### Narrative And Mechanical Boundaries

Global Narrative Resolution applies. The course may resolve when fulfilled,
genuinely impossible, rendered incoherent by a decisive change, fundamentally
reinterpreted by new knowledge, resolved by a freely confronted defining
transformation, or ended by another identifiable meaningful development. It
does not end from inconvenience, covered ordinary fear or doubt, GD plot need,
an expected surrender, or a necessary tactical change while the course remains
coherent.

The contract establishes only one bounded course. It grants no action,
Response, measured movement, exact route or destination, bonus, penalty,
advantage, disadvantage, immunity, Resistance, Protection, quantified output,
Health, resource, Attribute, or disabled ability. It removes no Fear, Control,
condition, field, attachment, active Power, or Injury; permits no action while
mechanically unable; bypasses no costs, restrictions, access, equipment,
authority, or capability; makes no impossible course possible; establishes no
false premise or rewritten memory; affects no other character; and does not
become Rally, Appeal, Cleanse, Resist, Blaze of Glory, or a Power. An accepted
success cannot be arbitrarily cancelled.

It is Counter-ineligible. It may use the normal Roleplay Ability action, an
ordinary outside-combat declaration, or a permitted Roleplay Window before
formal hostile-action declaration. It cannot be inserted as a Counter and does
not replace Block, Dodge, Resist, Cleanse, movement, a normal Response, or Deny
Imminent Hostile Act.

### Legacy And Runtime State

Legacy `specific: "STEEL_YOURSELF"` under Persuasion migrates to the standard
Method, and an exact generated outcome may migrate through resolved-cell
matching. `INSPIRE`, `ENCOURAGE`, `REASSURE`, `MOTIVATE`, `PERSEVERE`, `ENDURE`,
and `HOLD_FAST` remain Custom Method review because they are ambiguous between
Self, other recipients, Theme, and desired outcome. Explicit Custom Outcomes
remain Custom.

No `declaredPersonalCourse`, `personalCourse`, `chosenCourse`, `resolveCourse`,
`selfResolve`, `personalResolve`, `resolveText`, `adversity`, `motivatingMemory`,
`sustainingPurpose`, or equivalent field is stored or exposed by the Builder.

## Track And Trace Quarry

`TRACK` / Track is the second Perception Method, immediately after Discern
Truth. Its exact definition is:

> Locate or follow a missing, concealed, or moving subject by interpreting
> physical traces, disturbed environments, witness reports, behavioural
> patterns, magical signatures, spiritual impressions, or another coherent
> sign of passage.

Illustrative legal approaches are following footprints, tracks, blood, debris,
scent, or other physical traces; reading disturbed terrain, architecture,
vegetation, dust, water, or weather; connecting reliable sightings, testimony,
reports, or known movements; inferring direction and timing from wear,
displacement, decay, or environmental change; recognising a recurring magical,
spiritual, psychic, technological, or supernatural signature supported by the
Narrative Theme; distinguishing genuine signs from false trails or unrelated
disturbance; predicting a likely route from established habits, needs,
destination, or constraints; and maintaining pursuit through different
environments. Approaches are illustrative rather than exhaustive.

Track does not reveal unrelated secrets, identify an exploitable weakness,
establish an unrelated concealed truth, create evidence or traces, grant
omniscience or an exact current location, guarantee reaching or catching the
quarry, grant action or movement, bypass barriers or explicit mechanical
impossibility, remove quantified effects, affect the quarry, reveal the result
to others, broaden Scope, or let Difficulty or Legendary Impact legalise an
impossible, incoherent, or inaccessible pursuit.

Discern Truth learns concealed information about an accepted target or subject,
including a hidden fact or exploitable opportunity; it does not establish and
maintain a trail toward an absent quarry. Track interprets signs of passage to
establish or follow a true trail, may concern a quarry not currently present or
perceived, requires an accessible coherent connection, and reveals no unrelated
secret or weakness. Uncover Concealed Truth answers what concealed fact is true;
Reveal Exploitable Weakness identifies an actionable weakness, route,
dependency, pattern, or leverage point. Neither automatically establishes the
quarry's trail. Search and Investigate remain ordinary descriptions, Narrative
Themes, normal Trials, Discern Truth expressions, or Custom Methods according
to the result. Sense Danger and Read Intent remain Custom review or Discern
Truth expressions. None migrates automatically to Track.

### Trace Quarry Contract

`TRACE_QUARRY` / Trace Quarry is Help, Perception / Track, supports One Target
and Small Group, supports all four Scene Impacts, is Counter-ineligible at every
cell, and owns the family privilege key `TRACE_QUARRY`. Its exact fragments are:

- Minor: `you identify one recent accessible sign of {{quarryPossessive}} passage and the immediate direction or next nearby trace it indicates for the current meaningful exchange`
- Standard: `you establish a reliable trail left by {{quarryReference}} and can follow it through the current scene unless an identifiable change genuinely breaks or obscures that trail`
- Major: `you establish and maintain a reliable trail to {{quarryReference}} through the current scene despite serious concealment, false trails, difficult terrain, or deliberate evasion unless decisive circumstances make continued tracking impossible or incoherent`
- Legendary: `you uncover a defining trail, route, or signature leading toward {{quarryReference}} whose significance extends beyond the current scene and can continue following it until the quarry is reached or the pursuit is narratively resolved`

One Target supplies `quarryReference: the selected target` and
`quarryPossessive: the selected target's`. Small Group supplies
`quarryReference: the selected group` and `quarryPossessive: the selected
group's`. The outcome template is `{{impact}}`.

### Target-Access Exception And Declared Quarry

Track is an explicit target-access exception. The selected quarry need not be
in the same scene, visible, directly perceived, addressed, or interacted with.
Instead, the user must have an accessible coherent connection in the current
declaration: a physical trail; trace or disturbance; reliable last-known
location; linked possession or sample; witness testimony or reports; known
route or behavioural pattern; an appropriate magical, spiritual, psychic,
technological, or supernatural signature; or another coherent sign of passage.
This grants tracking access only, never interaction or attack range, line of
sight, communication, teleportation, or exact current-location knowledge.

Before Attribute or Difficulty, the player states the Declared Quarry: the
exact quarry or accepted group membership, accessible starting connection,
signs interpreted by Method and Theme, tracking objective, and fit with Scope
and Impact. One Target may be one person, creature, specifically traceable
object, vehicle or conveyance, or another coherent single moved subject. Small
Group must be clearly bounded, have travelled together enough to leave one
coherent shared trail, and be reached through the same connection and Method
expression. Unrelated travellers, whole organisations or settlements, factions
or armies, everyone passing through an area, bundled independent trails,
abstract ideas, inaccessible quarries, mechanically impossible trails, exact
worldwide location requests, automatic capture, or immediate barrier-bypassing
arrival are invalid. A group already split across materially different trails
must be narrowed or revised before Difficulty. Difficulty cannot legalise an
invalid quarry or connection.

### Binding Trail And Pursuit Boundaries

On success, the sign or trail is true, relevant to the accepted Declared
Quarry, and actionable at the selected Impact. It cannot be replaced by trivia,
secretly made false, reduced to a useless circular clue, or subjected to a
second roll merely to establish genuineness. The Game Director may introduce a
previously unspecified coherent trace, disturbance, witness detail, route,
signature, or sign as the Scene Manifestation when it fits established fiction,
contradicts no locked premise, is reachable through Method and Theme, fits
Impact and Scope, and creates no separate unpurchased outcome. Lack of a
prewritten trail does not weaken an accepted success. If no coherent trail can
exist, the declaration is rejected or revised before Difficulty.

Following a trail grants no movement. Normal travel, actions, time, tools,
access, hazards, environmental rules, unrelated rolls, enemies, terrain,
distance, and logistics still apply, and the quarry may continue moving. Minor
supplies one recent sign and immediate direction through the current meaningful
exchange. Standard establishes a scene-long trail until an identifiable genuine
break or obscuring change. Major persists through serious concealment, false
trails, difficult terrain, or deliberate evasion unless continuation becomes
decisively impossible or incoherent. Legendary may continue beyond the scene
until the quarry is reached or pursuit is narratively resolved, but never
teleports, intercepts, or captures automatically.

Small Group is one collective quarry with membership fixed when Difficulty is
set. Success does not create separate trails, exact individual locations,
later-member propagation, or organisation-wide tracking. If the group splits,
the contract does not grant every branch: the player may follow one coherent
branch where supported, another branch may need another declaration, and a
decisive split may resolve the collective pursuit.

The global Narrative Resolution doctrine applies. Pursuit may resolve when the
quarry is reached, the objective is fulfilled, continuation genuinely becomes
impossible, an inaccessible boundary or decisive signature change breaks it, a
group splits incompatibly, new information defeats coherence, or another
identifiable meaningful development resolves it. Inconvenience, plot
importance, ordinary evasion covered by Impact, an unprepared route, or bypass
of an expected investigation scene never ends it by itself.

Trace Quarry never guarantees reaching, catching, confronting, or defeating;
grants no action, Response, movement, speed, travel time, transport, or
teleportation; bypasses no barrier, hazard, access, distance, equipment, time,
environment, or explicit anti-tracking mechanic; reveals no unrelated secret,
memory, motive, weakness, or evidence; creates no incoherent trace; grants no
omniscience; removes no effect; alters no quarry; reveals nothing automatically
to others; broadens no Scope; grants no independent member trails or every
post-split branch; guarantees no later attempt; and cannot be cancelled merely
because it disrupts a planned plot or encounter.

Illustrative uses include following footprints from a raided farm, blood and
broken branches from an injured fugitive, witness sightings of a missing
courier, marks left by a stolen object's carrier, magical residue from one
supernatural quarry, the next trace of an escaping suspect, deliberate false
tracks, a patrol's shared trail, a small band through changing environments,
and a defining magical signature across scenes. Examples remain subject to the
exact Declared Quarry, Method, connection, Scope, Impact, Theme, and fiction.

Trace Quarry may use the normal Roleplay Ability action in combat when tracking
information is meaningfully available, an ordinary scene declaration, or
another existing legal Roleplay opportunity. It cannot be introduced as a
Counter after a formal hostile action begins and replaces neither Block, Dodge,
Resist, Cleanse, movement, navigation, travel, Search or investigation Trials,
nor Deny Imminent Hostile Act.

Legacy `specific: "TRACK"` with no explicit `methodId` under Perception migrates
to standard Track, and an exact generated legacy outcome may migrate through
resolved-cell matching to Trace Quarry. Explicit stored `methodId:
CUSTOM_REVIEW` remains Custom even when named Track. `SEARCH`, `INVESTIGATE`,
`SENSE_DANGER`, `READ_INTENT`, `HUNT`, and `LOCATE` remain Custom; explicit
Custom Outcomes remain Custom.

Declared Quarry and pursuit data are runtime-only. No quarry/member ID,
starting connection, trail or trace text, last-known location, objective,
route, direction, signature, pursuit-state, or equivalent field is stored in
RoleplayAbility or added to the Builder.

## Prove And Establish Verified Truth

`PROVE` / Prove is the third Perception Method, immediately after Track. Its
exact definition is:

> Establish one truthful conclusion for others by presenting, demonstrating,
> connecting, or revealing coherent evidence, testimony, signs, consequences,
> or another verifiable basis.

Illustrative legal approaches are presenting physical evidence that directly
supports one conclusion; demonstrating a repeatable or immediately observable
fact; connecting known clues into one coherent proof; exposing a contradiction
through a verifiable record or source; presenting reliable witness testimony;
reconstructing one event from accepted evidence; revealing an accessible
supporting detail that makes the truth demonstrable; and invoking magical,
spiritual, psychic, technological, or supernatural verification supported by
Narrative Theme and current fiction.

Prove does not discover whether a speculative claim is true or permit repeated
claim-testing; fabricate evidence, testimony, records, signs, credentials, or
authority; establish a false or misleading premise; reveal unrelated secrets or
weaknesses; compel action, cooperation, confession, emotion, admission, or
honesty; create comprehension, perception, memory, agency, or evaluative
capability; override conclusive disproof; grant quantified output; mechanically
alter audience or subject; affect anyone outside Scope; broaden Scope; or let
Difficulty or Legendary Impact legalise a false, unsupported, incoherent, or
inaccessible conclusion.

Discern Truth discovers a concealed fact or exploitable opportunity for the
user but does not establish it for an audience. Track establishes or follows a
quarry's trail but proves no unrelated conclusion. Prove starts with a truth for
which the user already has a coherent basis, presents that basis to selected
audience members, and never functions as a truth detector. Uncover Concealed
Truth answers what hidden fact is true; Reveal Exploitable Weakness identifies
an actionable weakness; neither proves the conclusion to others. Establish
False Belief uses Misdirect to establish falsehood, while Prove establishes
truth through verification. Secure Willing Cooperation uses Appeal to gain
agreement to a request; recognising truth compels no cooperation or response.

### Establish Verified Truth Contract

`ESTABLISH_VERIFIED_TRUTH` / Establish Verified Truth is Help, Perception /
Prove, supports One Target and Small Group at all four Scene Impacts, is
Counter-ineligible throughout, and owns family key
`ESTABLISH_VERIFIED_TRUTH`. Its outcome template is `{{impact}}`. One Target
supplies `audience: the target`; Small Group supplies `audience: every accepted
member of the selected group`. Exact fragments are:

- Minor: `{{audience}} recognises one small immediately verifiable truth as established for the current meaningful exchange and treats it as true when making relevant decisions`
- Standard: `{{audience}} recognises one meaningful truth relevant to the current situation as established for the rest of the current scene and treats it as true when making relevant decisions unless meaningful new evidence materially changes the conclusion`
- Major: `{{audience}} recognises one central truth shaping the current situation as conclusively established for the rest of the current scene and continues to treat it as true despite serious denial, pressure, loyalty, or personal cost unless decisive new evidence or narrative resolution materially changes the conclusion`
- Legendary: `{{audience}} recognises one defining truth whose consequences extend beyond the current scene as decisively established and treats it as true until its consequences are fulfilled or narratively resolved`

### Declared Truth And Audience Eligibility

Before Attribute or Difficulty the player states the runtime Declared Truth:
the exact audience, one exact truthful conclusion, the coherent evidentiary
basis already available, how Prove and Theme present it, why every audience
member can perceive and understand it, and its Scope/Impact fit. It must be one
bounded true conclusion with an accessible basis already known, discovered,
observed, or strongly supported by the character's information, presented by
one expression to every accepted member, relevant to the audience, within
Impact, and not a bundle of claims.

Prove is not a truth detector. Speculative declarations cannot be used to learn
whether the Game Director accepts them. If the character lacks sufficient
basis, the GD may reject the evidentiary foundation without confirming whether
the speculation is true. Unsupported accusations, bundled claims, fabricated
documents, city-wide audiences, or demands for confession or cooperation are
invalid. Difficulty cannot legalise a false, unsupported, bundled,
inaccessible, or incoherent conclusion.

Every accepted audience member must perceive the proof, understand the needed
conclusion, possess evaluative agency, be reached through the same expression,
be able coherently to recognise the same conclusion, and lack conclusive
disproof. Ineligible group members must be narrowed, revised, or rejected before
Difficulty. Difficulty may reflect complexity, distrust, bias, reputation,
loyalty, fear, pressure, or the least receptive eligible member, but cannot make
an ineligible member eligible.

### Binding Recognition And Evidence Manifestation

On success, every accepted audience member genuinely recognises the Declared
Truth and treats it as true in relevant decisions. There is no second
convincing roll, majority interpretation, hidden exemption, secretly
unconvinced member, post-success narrowing, weaker substitution, or secretly
fraudulent proof. Audience members retain values, loyalties, priorities,
emotions, tactics, resources, independent judgement, and the ability to conceal
recognition or lie publicly. Recognition compels no cooperation, confession,
surrender, testimony, disclosure, alliance, obedience, admission, or exact
action. A guard may recognise innocence but fear opposing a captain; a
councillor may recognise genuine evidence and lie publicly, but neither choice
may be justified by secretly denying the purchased truth.

The Game Director may introduce a previously unspecified coherent supporting
detail as Scene Manifestation: a matching mark, record entry, visible fracture,
overlooked residue, corroborating statement, repeatable reaction, magical or
technological verification, or another accessible detail. It must support the
already eligible Declared Truth, fit fiction, contradict no locked premise, be
reachable through Method and Theme, fit Scope/Impact, and create no unrelated
discovery. This does not fabricate evidence. Lack of a prewritten detail does
not weaken an accepted success; if no coherent proof can exist, reject or
revise before Difficulty.

### Small Group, Impact, And Narrative Resolution

Small Group uses the bounded scene-local group doctrine. Membership is exact
before Difficulty; every member receives the same evidence and conclusion, is
individually eligible, and is reached by one proof expression. Success binds
every member, never different conclusions, contradictory tailoring, majority
recognition, hidden dissenters, or propagation to outsiders, later arrivals,
followers, organisations, factions, armies, or the public.

Minor establishes one small immediately verifiable truth for relevant decisions
during the current meaningful exchange. Standard establishes one meaningful
situational truth for the scene unless meaningful new evidence materially
changes it. Major conclusively establishes one central scene-shaping truth
despite serious denial, pressure, loyalty, or cost unless decisive new evidence
or Narrative Resolution materially changes it. Legendary decisively establishes
one defining truth beyond the scene until consequences are fulfilled or
narratively resolved; it grants no permanent obedience, compulsory honesty, or
immutable memory. Ending the guaranteed contract does not erase ordinary memory
of what was proven.

The global Narrative Resolution doctrine applies. The contract may resolve
when immediate consequences are fulfilled, decisive new evidence materially
reframes the conclusion, the situation genuinely changes, relevance ends, a
defining controversy resolves, or another identifiable meaningful development
occurs. It does not resolve because recognition is inconvenient, disliked,
conflicts with loyalty or plot, evidence was unprepared, or someone lies
publicly.

Intrinsic exclusions: the contract does not discover speculative truth;
replace Discern Truth through repeated claim-testing; fabricate evidence,
records, testimony, credentials, signs, or authority; establish more than one
Declared Truth or any false, misleading, impossible, or incoherent conclusion;
reveal unrelated secrets, motives, memories, weaknesses, routes, or evidence;
compel cooperation, confession, surrender, testimony, disclosure, honesty,
alliance, obedience, admission, or action; remove independent judgement; create
comprehension, perception, memory, agency, or capability; grant quantified
output; mechanically alter audience or subject; affect outside Scope; broaden
Scope; permit majority interpretation, hidden exemptions, or per-member
resistance; propagate through testimony, leadership, reputation, institutions,
reports, or rumours; let Difficulty/Legendary legalise invalid proof; or permit
arbitrary cancellation after accepted success.

Examples include proving a prisoner's immediate alibi, demonstrating an unsafe
bridge, authenticating an order, proving a visible forgery, connecting records
and evidence to establish a betrayal, showing a ritual's dependence on an
object, proving an accused person was elsewhere, establishing a warning for a
small council, proving patrol orders came from its commander, or establishing a
defining historical or institutional truth beyond the scene. Every example
remains subject to evidence, Method, Scope, Impact, access, and fiction.

Establish Verified Truth may use a normal Roleplay action in combat where proof
can meaningfully be presented, an ordinary outside-combat declaration, or
another existing legal opportunity. It cannot be introduced as a Counter after
a formal hostile action begins and replaces neither Discern Truth, Track,
Appeal, Misdirect, Block, Dodge, Resist, Cleanse, nor Deny Imminent Hostile Act.

Legacy Perception `specific: "PROVE"` without stored `methodId` migrates to
standard Prove, and matching generated outcomes may migrate through resolved
cells to Establish Verified Truth. Explicit Custom Prove remains Custom.
`REVELATION`, `EXPOSE`, `DEMONSTRATE`, `PRESENT_EVIDENCE`, `CONVINCE`, and
`TESTIFY` remain Custom; explicit Custom Outcomes remain Custom.

Declared Truth, truth claims, verified truth, proof/evidence text, evidentiary
basis, audience members, truth subject, supporting detail, conclusion, and
equivalent proof/declaration state remain runtime-only and are never stored in
RoleplayAbility or added to the Builder.

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
12 Methods / 14 contracts / 14 keys / 88 planned / 88 completed / 0 missing.

The audit reports Method and contract order, supported Scopes, completed Impacts,
missing cells by contract, unresolved tokens, missing Scope fragments, duplicate
IDs/keys/cells, invalid Method ownership, blank outcomes, and Counter-resolution
errors.

## Future Scope Work

Steel Yourself is the first coherent Self-facing Method and Sustain Personal
Resolve is its only Self contract. Self is not generically unlocked for Rally,
Appeal, or any other family. Later Self-facing Methods still require coherent
Self grammar and effect identity. Large Group and Faction / Army remain
authorable only after coherent contract-specific Scope support and all required
Impact fragments are written and audited.

No numeric cost, cooldown, tuning, restriction discount, Prisma field, API
field, calculator behaviour, or combat-runtime mechanic is added here.
