# Roleplay Closed Beta Test Pack

Status: CANONICAL FIRST TABLE-FACING VALIDATION SET.

## Purpose

This pack tests the complete Roleplay standard library through fourteen
representative player-authored Abilities and one controlled dynamic-crisis
scene. Each existing Outcome Contract appears exactly once, all twelve Methods
appear, and Self, One Target, Small Group, all four Scene Impacts, both Outcome
Lanes, and the one current Counter-eligible family receive table-facing use.

The canonical deterministic source is
`scripts/roleplayClosedBetaLoadouts.smoke.ts`. Its fixtures reconcile through
the live public authoring helpers and its descriptors come from the live
resolver. These are validation loadouts grouped into conceptual archetypes.
They are not persisted characters, final pregenerated builds, balance
benchmarks, or promises about launch presentation.

## Non-Goals

This pack adds no Roleplay rule, Method, contract, Scope, Impact, field, UI
control, numeric cost, cooldown, runtime effect, API, Prisma change, migration,
or stored declaration state. It does not tune Difficulty or select universal
Attributes. It does not treat one confusing example as evidence for new
semantic breadth. Production Roleplay rules remain unchanged at 12 Methods, 14
contracts, 14 family keys, 88 planned cells, 88 completed cells, and zero
missing cells.

## Canonical Validation Loadouts

Every fixture uses three dice. The exact live descriptors are recorded below.

### The Envoy

#### A Fair Exchange

- Intention / Method: Persuasion / Appeal
- Contract: `SECURE_WILLING_COOPERATION`
- Scope / Impact: One Target / Standard
- Counter: unavailable / false
- Theme: You calmly identify what the other person actually values and offer
  one honest agreement that respects both sides.
- Exact descriptor: Choose one target and roll 3 dice. On success, the target
  willingly agrees to and sincerely carries out one meaningful request
  involving inconvenience, social cost, or modest personal risk.

#### The Evidence Speaks

- Intention / Method: Perception / Prove
- Contract: `ESTABLISH_VERIFIED_TRUTH`
- Scope / Impact: Small Group / Major
- Counter: unavailable / false
- Theme: You assemble the records, physical signs, and corroborating details
  into one clear demonstration that every accepted witness can independently
  verify.
- Exact descriptor: Choose a small group of targets and roll 3 dice. On
  success, every accepted member of the selected group recognises one central
  truth shaping the current situation as conclusively established for the rest
  of the current scene and continues to treat it as true despite serious
  denial, pressure, loyalty, or personal cost unless decisive new evidence or
  narrative resolution materially changes the conclusion.

### The Captain

#### Hold Together

- Intention / Method: Persuasion / Rally
- Contract: `ESTABLISH_SHARED_RESOLVE`
- Scope / Impact: Small Group / Standard
- Counter: unavailable / false
- Theme: You cut through panic with one clear shared priority and remind
  everyone why they must act together now.
- Exact descriptor: Choose a small group of targets and roll 3 dice. On
  success, the selected group adopts one clear shared course as its immediate
  priority for the rest of the current scene and sincerely pursues it despite
  meaningful fear, confusion, disagreement, or pressure.

#### One More Step

- Intention / Method: Persuasion / Steel Yourself
- Contract: `SUSTAIN_PERSONAL_RESOLVE`
- Scope / Impact: Self / Major
- Counter: unavailable / false
- Theme: You accept the fear and exhaustion without denying them, remember the
  people depending on you, and recommit to the promise carrying you forward.
- Exact descriptor: Roll 3 dice. On success, you hold to one difficult personal
  course for the rest of the current scene and sincerely pursue it despite
  serious fear, exhaustion, personal cost, temptation, or danger unless
  decisive circumstances or narrative resolution make that course no longer
  coherent.

#### Face Me

- Intention / Method: Intimidation / Challenge
- Contract: `DRAW_HOSTILE_ATTENTION`
- Scope / Impact: One Target / Minor
- Counter: unavailable / false
- Theme: You step openly into the threat's attention and make ignoring your
  challenge feel like a public admission of weakness.
- Exact descriptor: Choose one target and roll 3 dice. On success, the next
  time the target acts with hostility, it must direct that hostility at you, if
  you are a valid target.

### The Trickster

#### Wrong Door

- Intention / Method: Deception / Misdirect
- Contract: `ESTABLISH_FALSE_BELIEF`
- Scope / Impact: One Target / Standard
- Counter: unavailable / false
- Theme: You combine selective truth, confident timing, and one staged detail
  to lead the target toward the wrong immediate conclusion.
- Exact descriptor: Choose one target and roll 3 dice. On success, the target
  genuinely accepts one plausible false premise relevant to the current
  situation as true for the rest of the current scene and treats it as true
  when making relevant decisions unless meaningful contradictory evidence
  resolves the belief.

#### All Eyes Here

- Intention / Method: Deception / Distract
- Contract: `DIVERT_IMMEDIATE_ATTENTION`
- Scope / Impact: Small Group / Minor
- Counter: unavailable / false
- Theme: You create one urgent, spectacular commotion that captures the whole
  patrol's active attention for a brief opening.
- Exact descriptor: Choose a small group of targets and roll 3 dice. On
  success, every accepted member of the selected group has their active
  attention diverted for the current meaningful exchange, creating a brief
  opening for one declared small immediate action or development to proceed
  without deliberate observation or interference from any accepted member.

### The Seeker

#### What Are They Hiding?

- Intention / Method: Perception / Discern Truth
- Contract: `UNCOVER_CONCEALED_TRUTH`
- Scope / Impact: One Target / Standard
- Counter: unavailable / false
- Theme: You compare what the subject says, what they avoid, and what the
  surrounding evidence makes difficult to explain.
- Exact descriptor: Choose one target and roll 3 dice. On success, you learn one
  useful concealed truth about the target relevant to the immediate situation;
  if no qualifying concealed truth exists, you learn that nothing relevant is
  being concealed.

#### The Weak Link

- Intention / Method: Perception / Discern Truth
- Contract: `REVEAL_EXPLOITABLE_WEAKNESS`
- Scope / Impact: One Target / Major
- Counter: unavailable / false
- Theme: You study repeated patterns, dependencies, and overlooked constraints
  until the central practical vulnerability becomes clear.
- Exact descriptor: Choose one target and roll 3 dice. On success, you reveal
  one central exploitable vulnerability or opportunity concerning the target
  that is shaping the current scene and can materially change how it is
  approached; if no qualifying exploitable opportunity exists, you learn that
  none is presently accessible.

#### Trail Through Ash

- Intention / Method: Perception / Track
- Contract: `TRACE_QUARRY`
- Scope / Impact: Small Group / Standard
- Counter: unavailable / false
- Theme: You separate the group's shared passage from the chaos around it by
  reading disturbed ash, hurried movement, fading signs, and corroborating
  sightings.
- Exact descriptor: Choose a small group of targets and roll 3 dice. On
  success, you establish a reliable trail left by the selected group and can
  follow it through the current scene unless an identifiable change genuinely
  breaks or obscures that trail.

### The Guardian

#### Down, Stay Quiet

- Intention / Method: Intervention / Rescue
- Contract: `HIDE_FROM_IMMEDIATE_DANGER`
- Scope / Impact: Small Group / Minor
- Counter: unavailable / false
- Theme: You sweep the frightened civilians into one coherent concealed pocket
  and draw the immediate danger past them.
- Exact descriptor: Choose a small group of targets and roll 3 dice. On
  success, every accepted member of the selected group becomes hidden from one
  declared immediate danger.

#### Everyone Clear

- Intention / Method: Intervention / Rescue
- Contract: `SECURE_IMMEDIATE_SAFETY`
- Scope / Impact: Small Group / Standard
- Counter: unavailable / false
- Theme: You identify one viable route through the collapsing district and
  coordinate the entire accepted group through it before the peril closes.
- Exact descriptor: Choose a small group of targets and roll 3 dice. On
  success, every accepted member of the selected group is secured from one
  declared immediate peril and is no longer directly threatened by it.

#### Not This Time

- Intention / Method: Intervention / Interrupt
- Contract: `DENY_IMMINENT_HOSTILE_ACT`
- Scope / Impact: One Target / Major
- Counter: enabled / true
- Theme: At the decisive moment, you interpose, expose the opening in the
  hostile act, and break it before it can resolve.
- Exact descriptor: Choose one target and roll 3 dice. On success, the target's
  current or next hostile action fails.

### The Dread Herald

#### Your Hunt Ends Here

- Intention / Method: Intimidation / Overawe
- Contract: `BREAK_SHARED_RESOLVE`
- Scope / Impact: Small Group / Legendary
- Counter: unavailable / false
- Theme: You reveal the full consequence of continuing the hunt and make the
  group's defining course of opposition feel impossible to justify or survive.
- Exact descriptor: Choose a small group of targets and roll 3 dice. On
  success, the selected group adopts an enduring refusal to pursue one defining
  course of opposition whose consequences extend beyond the current scene and
  maintains that refusal until it is narratively resolved.

## Controlled Crisis: The Ashfall Ward

### Scene Premise

A fire races through the old Ashfall Ward after sabotage weakens an elevated
water conduit. Burning roofs and a leaning bell tower create spreading fire and
structural danger. A bounded group of civilians is trapped behind a fallen
market arcade. A hostile city patrol hunts them and the player characters,
believing a forged order names them as saboteurs.

The patrol captain conceals that she received the order after its commander's
death. The patrol's practical weakness is its dependence on one exposed signal
whistle and the captain's repeated visual confirmations before coordinated
movement. The authentic duty ledger, a mismatched seal, messenger timings, and
ash-preserved boot marks can prove that the visible order is forged. A small
band of true saboteurs flees through the district, leaving one coherent shared
trail through ash, broken shutters, dropped lamp oil, and witness sightings.

During the crisis, one patrol member begins a formal hostile act: cutting the
last support rope while civilians cross a suspended walkway. This provides a
clear Roleplay Window and a legal Counter opportunity for Not This Time.

At least two non-combat victory routes remain viable:

1. Rescue the civilians, prove the order false to the patrol, and secure the
   captain's willing cooperation in containing the fire.
2. Misdirect or distract the patrol, track the real saboteurs, reveal their
   weakness, and break the hunting group's resolve without defeating it in
   combat.

Hybrid routes are valid. The scene must not force any named Ability or make a
failed declaration block every route.

## Suggested Scene Beats

1. Opening collapse: expose trapped civilians, the spreading fire, and the
   patrol's arrival. Hold Together can establish a shared rescue course; One
   More Step can sustain a character facing fear or exhaustion.
2. Immediate shelter: falling embers and patrol sightlines create opportunities
   for Down, Stay Quiet and Everyone Clear without prescribing either solution.
3. Hostile focus: the captain threatens the group while a patrol member scans
   for escapees. Face Me, Wrong Door, or All Eyes Here may change the immediate
   pressure in distinct ways.
4. Concealed contradiction: the captain's evasive account and the dead
   commander's timestamp make What Are They Hiding? eligible.
5. Practical dependency: signal discipline and the exposed whistle create an
   eligible subject for The Weak Link.
6. Evidentiary convergence: ledger, seal, timings, and physical marks allow The
   Evidence Speaks to establish one truthful conclusion for the accepted
   patrol audience.
7. Negotiated pivot: once the situation is understood, A Fair Exchange can ask
   the captain for one meaningful cooperative course; recognition alone must
   not be treated as automatic cooperation.
8. Trail revealed: ash, oil, broken shutters, and sightings expose the
   saboteurs' coherent shared trail for Trail Through Ash.
9. Defining confrontation: the hunting group can be shown the consequences of
   continuing its defining opposition, creating a possible Your Hunt Ends Here
   declaration.
10. Formal hostile act: clearly declare the support-rope cut before resolution,
    preserving a legal Counter window for Not This Time. Do not manufacture the
    act merely to trigger the fixture if the fiction has already moved on.

These beats expose every fixture but never require a player to use it. Ordinary
Trials, Powers, negotiation, retreat, environmental action, and creative
alternatives remain legal.

## Game Director Adjudication Checklist

- [ ] Was the Declared Aim stated before Difficulty?
- [ ] Did the Method and Narrative Theme fit the proposed approach?
- [ ] Was Scope eligibility confirmed, including exact group membership?
- [ ] Was the accepted Outcome Contract understood before rolling?
- [ ] Was success honoured without weakening, substitution, or a second roll?
- [ ] Was failure distinguished from successful contract resolution?
- [ ] Was Narrative Resolution identifiable rather than arbitrary?

## Player Observation Checklist

- [ ] Could the player predict the result before rolling?
- [ ] Did Scope and Impact feel meaningfully different?
- [ ] Did the Method list make sense for the intended approach?
- [ ] Did Outcome Contract wording match the intended fantasy?
- [ ] Did the generated descriptor help or confuse?
- [ ] Did the player try to purchase an excluded secondary result?
- [ ] Did the player understand that success establishes the result rather than
      granting a numeric modifier?

## Game Director Observation Checklist

- [ ] Record time needed to adjudicate each declaration.
- [ ] Count declarations that required narrowing or revision.
- [ ] Record disagreement about Method ownership.
- [ ] Record disagreement about Scope eligibility or group membership.
- [ ] Record any temptation to weaken a successful contract.
- [ ] Record difficulty selecting Attribute and Difficulty.
- [ ] Record confusion between Roleplay Ability outcomes and Power mechanics.

## Structured Use Results Sheet

Complete one row for every declared use, including failures and revised
declarations.

| Field | Observation |
| --- | --- |
| Character / archetype | |
| Ability | |
| Declaration / Declared Aim | |
| Selected Attribute | |
| Difficulty | |
| Roll result | |
| Success or failure | |
| Contract outcome | |
| Adjudication time | |
| Player confidence before roll | |
| Player confidence after resolution | |
| Dispute or ambiguity | |
| Recommended change | |

For repeated sessions, assign each use a session ID, scene beat, and sequence
number so similar observations can be compared without conflating separate
declarations.

## Evidence Discipline

No new Method or Outcome Contract is proposed from one confusing example.
Record repeated patterns across players, Game Directors, archetypes, contracts,
Scopes, and Impacts before changing the standard library. First determine
whether confusion came from fixture wording, declaration quality, scene setup,
adjudication, descriptor presentation, or an actual semantic gap.

Semantic breadth is temporarily frozen while this evidence gate runs. Numeric
costing remains locked and is not inferred from player preference,
adjudication time, or success frequency in this pack.
