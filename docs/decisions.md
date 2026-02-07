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

## 3. Summoning Circle (Monsters)

### 3.1 Monster definition and intent

**Decision:** In SMASH, a **Monster** is a campaign-scoped (or globally shipped, read-only) rules object that converts a fixed resource budget into a rendered stat block usable at the table.

**Intent:**
- Monsters are authored as a **preparatory tool**.
- The resulting Monster Block must be **printable and runnable without a device**.
- Digital systems may assist with tracking (cooldowns, over-time effects), but must not be required to play.

Monsters are not Characters and are not Items.

---

### 3.2 Ownership and mutability

- The core SMASH Beastiary ships as **global, read-only Monsters**.
- Global Monsters must be **copied** before editing.
- Monsters created or copied within the Summoning Circle are **campaign-owned and editable**.
- There is no template or shared-power system in V1.
  - Reuse is handled via **Monster duplication**.

---

### 3.3 Core construction model

Monsters are authored using a constrained resource model:

Tier examples include: Minion, Soldier, Elite, Boss.  
Optional flags (e.g. Legendary) unlock additional, isolated resource pools.

All numeric values appearing on a Monster Block must be traceable to:
- Base tables, or
- Explicit resource allocations, or
- Explicit modifiers.

No hidden or implicit math is permitted.

---

### 3.4 Monster structure (conceptual)

A Monster is composed of:

- **Monster Core**
  - Name
  - Level
  - Tier
  - Tags (e.g. `#undead`)
  - Legendary flag (optional)

- **Stat Allocation**
  - Physical Resilience
  - Mental Perseverance
  - Core Attributes
  - Weapon Skill
  - Armor Skill
  - Derived values and modifiers

- **Powers**
  - Fully composed from structured inputs (see 3.5)

- **Optional Custom Text**
  - Freeform descriptive text
  - **Non-computable**
  - Has no cost impact and causes no automatic mechanical effects

---

### 3.5 Power construction rules

Powers are **composed**, not freeform.

Each Power consists of:
- Name
- Action text (rendered mechanical description)
- One or more **Intentions** (e.g. Attack, Healing, Control)
- Intention specifics (e.g. what is healed, what is controlled)
- Range targeting
- Magnitude / Potency
- Response flag
- Cooldown (derived from cost, with optional reduction via resource spend)

Multiple Intentions may exist within a single Power.

There is **no shared Power library** in V1.  
All Powers are authored inline per Monster.

---

### 3.6 Tags

- Monsters support tags (e.g. `#undead`, `#goblin`).
- Tags serve both:
  - Organizational / filtering purposes
  - Explicit rule references (e.g. effects that target a tag)
- Tag identifiers must be **stable strings**.

---

### 3.7 Weapon projection (Monsters)

Monsters may reference an **equipped weapon** (read-only).

Weapon projection:
- Does not consume Monster resources
- Does not imply item ownership
- Projects:
  - Attack / weapon name
  - Attack descriptors (melee / ranged / AoE)
  - Attack-string-specific attributes (e.g. reload, dangerous)

Global weapon attributes render separately from attack-string-specific attributes.

If a referenced weapon is deleted:
- Monsters display a “Referenced item missing” state
- Deletion is not blocked by Monster references

---

### 3.8 Session runtime separation

The Summoning Circle produces static Monster definitions.

Session runtime systems may:
- Instantiate multiple copies of a Monster
- Track current PR / MP
- Track cooldowns and over-time effects

Runtime state does not mutate the underlying Monster definition.

## 4. Token Policy
### 4.1 Token syntax
- Tokens use bracket form: `[TokenName]`
- Capitalized words, no spaces
- Example: `[AoeLineWidthFeet]`

### 4.2 Token ownership & replacement
- Token replacement happens inside the descriptor engine (not in UI components).
- Admin UI provides token helper buttons and token whitelists per attribute type.

### 4.3 Tokens with special semantics (examples)
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

## 5. Data Model Invariants
### 5.1 Join-table rule
- Any value that is “per item per attribute” lives on a join table between ItemTemplate and the attribute table.
  - Example: ItemTemplateWeaponAttribute.strengthSource / rangeSource
- Do not store per-attribute choices on ItemTemplate directly.

### 5.2 Attribute template storage
- Attribute templates live on:
  - WeaponAttribute.descriptorTemplate (+ notes + requirement flags)
  - ArmorAttribute.descriptorTemplate (+ notes + requirement flags)
  - ShieldAttribute.descriptorTemplate (+ notes + requirement flags)

### 5.3 Cost system
- ForgeCostEntry stores costs in a context matrix:
  - category + selector1/2/3 + value (+ notes)
- Selector semantics are category-specific; avoid “magic placeholders” like TBC.

## 6. Admin UI Rules (Forge Values)
- Admin UI edits are data-driven and persist to DB via /api/admin/* routes.
- PATCH endpoints accept partial updates and must not require unrelated fields (e.g. name required) unless explicitly designed.
- Token helper buttons must match the whitelist for the selected attribute type.
- Never hide errors; fail loudly and deterministically.

## 7. Deployment + Ops
- Source control: GitHub
- Deploy: Vercel
- DB/Auth: Supabase (Postgres + Auth)
- Prisma migrations are the source of truth for schema changes.
