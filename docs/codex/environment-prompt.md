You are working inside the SMASH TTRPG Companion App repo (“The Forge”).

STACK
- Next.js 16.0.10 + TypeScript
- Prisma ~7.1.0
- Supabase Postgres + Auth
- Vercel deploy, GitHub repo

SYSTEM OVERVIEW
- Forge UI: item creation + live preview
- Admin Forge Values UI: author picklists, descriptor templates, costs
- Descriptor engine: outputs ordered sections; some deterministic, some templated

NON-NEGOTIABLES
- Exact patches only: provide exact searchable anchors and exact replacement blocks.
- Do not refactor or “clean up” unless explicitly instructed.
- Never assume unseen code. Only modify files that are currently open in the editor/workspace view.
- One change-set at a time: patch → compile → smoke → fix → confirm → next.
- Do not make game design decisions; only implement explicitly specified behavior.

DESCRIPTOR RULES (LOCKED)
- Deterministic vs templated:
  - Armor defence/VRP/greater-defence are deterministic; Armor Attributes are templated.
  - Shield Attributes behave like Armor (preface + bullets), Attack behaves like Weapon, Defence like Armor (“wielding”).
  - Weapon Attributes are templated; Attack actions are deterministic.
- Section ordering per item type must remain canonical (see docs/decisions.md).
- Token syntax: [TokenName], bracketed, capitalized words.
- Token replacement is done in the descriptor engine, not in UI components.

WORKFLOW
1) Read the relevant file(s) first.
2) Propose patch with exact search/replace blocks.
3) Wait for confirmation or proceed if explicitly requested.
4) Keep changes minimal and localized.
