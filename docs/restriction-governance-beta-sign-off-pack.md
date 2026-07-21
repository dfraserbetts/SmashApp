# Restriction Governance Beta Sign-Off Pack

Status: PLAYER RESTRICTION AUTHORING AND GOVERNANCE BETA — END-TO-END TESTABLE.

## 1. Purpose

This pack freezes the accepted Player Restriction Authoring and Governance Beta
scope at its signed build. It records the signed browser acceptance matrix,
defines evidence discipline, provides a reusable regression checklist, and
prevents explicitly deferred work from being confused with defects in the
accepted beta loop.

This is an acceptance and evidence record. It adds no system rule, runtime
behaviour, economic authority, persistence shape, or implementation scope.

## 2. Signed Build And Environments

- Signed commit: `5e5e7183e06ed2f73156cbcb74e40477a2be244e`.
- Local environment: `http://localhost:3000`.
- Production environment: `https://smash-app-blond.vercel.app`.
- Browser sign-off: passed on both environments.
- Tester: Architect / Lead Game Designer.
- Sign-off date: 2026-07-21.
- Open beta-blocking defects at sign-off: none reported.

No browser version, operating-system build, campaign ID, user ID, screenshot,
PDF, or test timestamp is asserted where it was not recorded.

## 3. Signed Scope

The signed beta loop accepts:

- Player Power Restriction authoring;
- Signature Move Restriction authoring;
- Roleplay Ability Restriction authoring;
- the currently available Standard Structured and Custom Narrative authoring;
- saved semantic persistence;
- authenticated submit and resubmit;
- immutable submitted proposals;
- Draft, Pending Game Director Approval, Approved, Changes Requested, and
  Approval Stale handling;
- the GD campaign Approvals queue and server-authoritative Pending count;
- tier-required approval;
- note-required Request Changes;
- current semantic-fingerprint enforcement;
- hard deletion of Player Power and Signature Move governance and related review
  events when the consumer is successfully deleted and the Character is saved;
- table-ready Print projection for Player Powers, the Signature Move, and
  Roleplay Abilities;
- printed ordinary Power and Signature Move budget recalculation from included
  Powers only;
- fail-closed omission of restricted content when governance is unavailable;
- unrestricted content remaining printable without approval; and
- the Print action remaining available when content is omitted.

## 4. Explicit Non-Goals And Deferred Work

The signed beta does not claim or activate:

- active Restriction discount economics;
- Net BPV;
- an Oath Limitation rate;
- the exceptional combined cap;
- runtime eligibility enforcement;
- Combat Lab evaluation of Restriction eligibility;
- Monster approval provenance;
- Campaign-Custom values or authoring;
- a final self-approval policy;
- complete broader reliable-enabler or wider-context staleness policy;
- Power Burdens; or
- full Restriction production completion.

These items are deferred work, not failed acceptance tests.

## 5. Browser Acceptance Matrix

| ID | Scenario | Expected Result | Local | Vercel | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| RG-01 | Author and save an unrestricted Power. | Saves and prints without governance approval. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-02 | Author and save a restricted Power. | Governance Draft is visible and content is not table-ready. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-03 | Submit a restricted Power. | An immutable Pending request appears for the GD and the Pending count updates. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-04 | Attempt approval without a tier. | Approval remains unavailable. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-05 | Approve with a tier. | Lifecycle becomes current Approved; no economic credit changes spend. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-06 | Request Changes with a note. | Lifecycle becomes Changes Requested and player-visible note/history exists. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-07 | Edit approved Restriction semantics. | Approval becomes stale and currentness fails. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-08 | Rename or reorder a governed Power. | Governance remains because the stable ID remains. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-09 | Remove only the Restriction while retaining the Power. | Power becomes unrestricted and printable; historical governance does not block it. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-10 | Delete a Pending governed Player Power and save. | Governance and review events are hard-deleted; queue and count update. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-11 | Delete a governed Signature Move and save. | Governance and review events are hard-deleted. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-12 | Print mixed unrestricted, Approved, Pending, stale, and Changes Requested content. | Only unrestricted and current Approved content prints. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-13 | Inspect Print Setup omissions. | Omitted consumer type, name, and readable reason are shown. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-14 | Print or save PDF. | Print Setup and omitted content do not appear on paper/PDF. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-15 | Inspect printed Power budgets. | Omitted Power spend is excluded; included Powers retain gross cost. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-16 | Omit every Power through the table-ready projection. | The existing empty Power-sheet state renders safely. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-17 | Make the governance endpoint unavailable. | Unrestricted content remains; restricted content is omitted; a prominent warning appears; Print remains enabled. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |
| RG-18 | Recheck Builder live preview and campaign Approvals. | Existing behaviour remains unchanged. | PASS — manually verified by Architect | PASS — manually verified by Architect | Architect manual sign-off | PASS |

## 6. Evidence Manifest

| Evidence ID | Scenario | Environment | Artifact / Reference | Captured By | Date | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RG-E01 | Pending request in GD Approvals | Local and Vercel | Manual verification recorded; screenshot/PDF not stored in repository. | Architect / Lead Game Designer | 2026-07-21 | PASS |
| RG-E02 | Current Approved state | Local and Vercel | Manual verification recorded; screenshot/PDF not stored in repository. | Architect / Lead Game Designer | 2026-07-21 | PASS |
| RG-E03 | Deleted Power removed from queue and Pending count | Local and Vercel | Manual verification recorded; screenshot/PDF not stored in repository. | Architect / Lead Game Designer | 2026-07-21 | PASS |
| RG-E04 | Print Setup omission list | Local and Vercel | Manual verification recorded; screenshot/PDF not stored in repository. | Architect / Lead Game Designer | 2026-07-21 | PASS |
| RG-E05 | Final PDF/print excludes omitted content and Print Setup | Local and Vercel | Manual verification recorded; screenshot/PDF not stored in repository. | Architect / Lead Game Designer | 2026-07-21 | PASS |

Evidence categories are distinct:

- **Manual acceptance evidence** is the Architect's recorded observation that a
  scenario passed in a named environment. It is authoritative for this signed
  browser matrix but is not a stored visual artifact.
- **Stored screenshot/PDF evidence** is a repository or controlled evidence-path
  artifact that can be inspected later. None is claimed by this pack.
- **Automated smoke coverage** is deterministic code-level and static-integration
  evidence. It supports regression confidence but does not replace the signed
  browser observation.

## 7. Automated Validation Record

The final Phase 4C3 delivery reported:

- 29 smoke suites passed;
- Restriction Print projection smoke: 40 checks;
- Restriction Print integration static smoke: 21 checks;
- Prisma validate passed;
- Prisma generate passed;
- targeted ESLint passed;
- TypeScript passed;
- production build passed; and
- `git diff --check` passed.

The integrated beta scope also retains the current deleted-Power governance
smoke, `scripts/restrictionDeletedPowerGovernance.smoke.ts`, covering Player
Power and Signature Move cleanup boundaries. These suites were not rerun merely
to create this documentation record.

## 8. Regression Checklist

For future changes touching Character Builder persistence, governance lifecycle,
the governance queue, consumer stable IDs, deletion cleanup, Restriction
fingerprinting, Print Mode, CharacterSheetPreview, Power budgets, or Roleplay
Ability persistence, confirm:

- [ ] Valid unrestricted content still bypasses Restriction approval.
- [ ] Restricted content requires current Approved governance and a matching
      saved semantic fingerprint.
- [ ] Pending, Changes Requested, and Approval Stale restricted content cannot
      print.
- [ ] Draft, missing-governance, malformed, unresolved-legacy, unsupported, and
      mismatched restricted content cannot print.
- [ ] Rename and reorder preserve governance through stable consumer IDs.
- [ ] Successfully saved Player Power deletion removes its governance and review
      events.
- [ ] Successfully saved Signature Move deletion removes its governance and
      review events.
- [ ] Roleplay deletion remains under its current separate policy and is not
      silently moved into Power/Signature hard-delete cleanup.
- [ ] The campaign Pending count and queue update after lifecycle and deletion
      changes.
- [ ] Printed ordinary Power and Signature Move budgets match the Powers that
      actually print.
- [ ] Included restricted Powers retain gross cost.
- [ ] Governance failure fails closed only for restricted content, leaves
      unrestricted content printable, displays the warning, and leaves Print
      enabled.
- [ ] Print Setup and omission warnings remain absent from paper/PDF output.
- [ ] Character Builder live preview and campaign Approvals behaviour remain
      unchanged by Print projection work.
- [ ] No Restriction economic credit, Net BPV, discounted spend, or cooldown
      change silently activates.

## 9. Defect Record Template

| Field | Record |
| --- | --- |
| Defect ID | |
| Date | |
| Reporter | |
| Commit | |
| Environment | |
| Account role | |
| Campaign/Character reference using non-secret labels | |
| Consumer type | |
| Consumer lifecycle | |
| Reproduction steps | |
| Expected result | |
| Actual result | |
| Evidence | |
| Severity | |
| Beta-blocking yes/no | |
| Resolution commit | |
| Retest result | |

Do not place secrets, user IDs, private campaign identifiers, access tokens, or
personal data in this record.

## 10. Reopen And Stop-Line Rules

The beta sign-off may be reopened when a reproducible defect affects the signed
scope, including:

- data loss;
- approval or currentness errors;
- unauthorized review actions;
- stuck or incorrect queue entries or Pending counts;
- stable-ID governance loss after rename or reorder;
- Player Power or Signature Move deletion-cleanup failure;
- unapproved restricted content appearing in Print;
- printed budgets not matching printed Powers; or
- restricted content printing when governance is unavailable.

The beta sign-off must not be reopened merely because a deferred feature remains
unimplemented.

No further Restriction implementation should begin unless:

1. a browser-tested beta-blocking regression is reproduced; or
2. the Architect explicitly authorizes a new deferred phase.

## 11. Final Sign-Off

- Status: PLAYER RESTRICTION AUTHORING AND GOVERNANCE BETA — END-TO-END
  TESTABLE.
- Signed commit: `5e5e7183e06ed2f73156cbcb74e40477a2be244e`.
- Local: PASS.
- Vercel: PASS.
- Automated validation: PASS.
- Open beta-blocking defects: none reported.
- Complete Restriction production readiness: explicitly not claimed.

This sign-off freezes the accepted beta implementation at the signed commit.
Future Restriction work is regression-only unless a deferred phase is explicitly
reopened by the Architect.
