# Codex Execution Brief — Template

## 1) Goal
Describe exactly what to implement. One feature at a time.

## 2) Constraints (non-negotiable)
- Exact patches only (searchable anchors + exact replacement blocks)
- Do not refactor unrelated code
- Do not rename existing concepts unless specified
- Never assume unseen code; only edit files that are open in the editor
- One change-set at a time: patch → compile → smoke → fix → confirm → next
- Do not make game design decisions; implement specified behavior only

## 3) Files Allowed to Change
List explicit files. Do not change others.

## 4) Data Model Changes (if any)
- Prisma schema change(s)
- Migration name
- Fields + defaults
- Join-table placement (if per-item per-attribute)

## 5) API Changes (if any)
- Routes to update
- Request/response shape
- Prisma queries to include/select required fields

## 6) UI Changes (if any)
- Admin UI changes (flags, token helper buttons, save payload)
- Forge UI changes (inputs, gating, hydration)

## 7) Descriptor Engine Changes (if any)
- New tokens + semantics
- Where values come from
- Fallback behavior

## 8) Acceptance Tests (smoke pass)
Write “Given/When/Then” bullets. Example:
- Given WeaponAttribute X requiresRangeSelection,
  When I select X and choose Ranged,
  Then preview renders [ChosenRange] as “Ranged”
  And save persists rangeSource to ItemTemplateWeaponAttribute
  And reload hydrates it.

