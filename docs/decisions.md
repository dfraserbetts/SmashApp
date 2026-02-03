# SMASH Companion App — Engineering Decisions (Constitution)

This document captures long-lived decisions and invariants. It is not a task log.
When in doubt: preserve shipped behavior, avoid refactors, and follow section ordering.

## 0. Project Snapshot
- Product: SMASH TTRPG Companion App ("The Forge")
- Stack: Next.js 16.0.10, React, TypeScript, Prisma ~7.1.0, Supabase (Auth + Postgres), Vercel deploy, GitHub repo
- High-level modules:
  - Forge UI (item creation + preview rendering)
  - Admin Forge Values UI (authoring picklists, templates, costs)
  - Descriptor engine (deterministic + templated sections)
  - API routes (picklists, admin CRUD, forge save/load)

## 1. Non-negotiables (Engineering)
- Forge UI is feature-complete (except Consumables later). Do not refactor or redesign it unless explicitly requested.
- Exact patches only:
  - Use exact searchable anchors.
  - Provide exact replacement blocks.
  - No “something like this” instructions.
- Never assume unseen code. If the file isn't open/available, request it.
- One change-set at a time:
  - patch → compile → smoke → fix → confirm → next patch.
- No refactors without instruction (including “cleanup”).
- Do not make game design decisions; implement only the design specified.

## 2. Descriptor System Principles
### 2.1 Deterministic vs Templated
- Deterministic sections are code-generated (not templates).
- Templated sections are admin-authored templates stored in attribute tables.

Locked decisions:
- Armor:
  - Defence string (PPV/MPV) = deterministic
  - VRP = deterministic
  - Greater Defence effects = deterministic mapping
  - Armor Attributes = templated (ArmorAttribute.descriptorTemplate)
- Shield:
  - Attributes box behaves like Armor (preface + bullets)
  - Attack actions behave like Weapon
  - Defence behaves like Armor with "wielding this shield" phrasing
- Weapon:
  - Attack actions = deterministic, based on picklists
  - Weapon Attributes = templated (WeaponAttribute.descriptorTemplate)

### 2.2 Section Ordering (Canonical Output)
Weapons render:
1) Attributes (Global Mods + Weapon Attributes + Custom Weapon text)
2) Attack Actions (Melee / Ranged / AoE blocks)

Armor renders:
1) Attributes (Preface + bullets: Global Mods → VRP → Armor Attributes → Custom)
2) Defence (PPV/MPV line(s), then Greater Defence effects)

Shield renders:
1) Attributes (Preface + bullets: Global Mods → VRP → Shield Attributes → Custom)
2) Defence (combined PPV/MPV sentence if both exist)
3) Attack Actions (Melee etc, same as weapon)

### 2.3 “Preface + Bullets” rule for Armor/Shield Attributes box
- If any of Global Mods / VRP / (Armor or Shield) Attributes exist:
  - render preface line:
    - Armor: "Whilst wearing this armor, the wielder gains"
    - Shield: "Whilst wielding this shield, the wielder gains"
  - then bullet points for those lines (strip repeated prefix phrases from bullets)
- If only Custom text exists:
  - do not render the preface line; render only Custom.

### 2.4 Wording Invariants
- Armor:
  - “Whilst wearing this armor …”
- Shield:
  - “Whilst wielding this shield …”
- VRP wording:
  - “you gain +X to Defence rolls …” / “you suffer −X to Defence rolls …”
  - (“to” not “on”)

## 3. Token Policy
### 3.1 Token syntax
- Tokens use bracket form: `[TokenName]`
- Capitalized words, no spaces
- Example: `[AoeLineWidthFeet]`

### 3.2 Token ownership & replacement
- Token replacement happens inside the descriptor engine (not in UI components).
- Admin UI provides token helper buttons and token whitelists per attribute type.

### 3.3 Tokens with special semantics (examples)
- `[AttributeValue]`:
  - resolves from:
    - explicit per-item param if provided (preferred), else
    - parsed from attribute name suffix (legacy), else
    - item-specific option mapping (e.g., Warding/Sanctified options), else "?"
- `[ChosenPhysicalStrength]` / `[ChosenMentalStrength]`:
  - require Forge selection of Strength Source (MELEE/RANGED/AOE)
  - strength values are taken from the selected range's strength inputs
- `[ChosenRange]`:
  - requires Forge selection of Range Source (MELEE/RANGED/AOE)
  - resolves to "Melee" / "Ranged" / "AoE"

## 4. Data Model Invariants
### 4.1 Join-table rule
- Any value that is “per item per attribute” lives on a join table between ItemTemplate and the attribute table.
  - Example: ItemTemplateWeaponAttribute.strengthSource / rangeSource
- Do not store per-attribute choices on ItemTemplate directly.

### 4.2 Attribute template storage
- Attribute templates live on:
  - WeaponAttribute.descriptorTemplate (+ notes + requirement flags)
  - ArmorAttribute.descriptorTemplate (+ notes + requirement flags)
  - ShieldAttribute.descriptorTemplate (+ notes + requirement flags)

### 4.3 Cost system
- ForgeCostEntry stores costs in a context matrix:
  - category + selector1/2/3 + value (+ notes)
- Selector semantics are category-specific; avoid “magic placeholders” like TBC.

## 5. Admin UI Rules (Forge Values)
- Admin UI edits are data-driven and persist to DB via /api/admin/* routes.
- PATCH endpoints accept partial updates and must not require unrelated fields (e.g. name required) unless explicitly designed.
- Token helper buttons must match the whitelist for the selected attribute type.
- Never hide errors; fail loudly and deterministically.

## 6. Deployment + Ops
- Source control: GitHub
- Deploy: Vercel
- DB/Auth: Supabase (Postgres + Auth)
- Prisma migrations are the source of truth for schema changes.
