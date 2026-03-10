# UI Tooltip Audit

Count methodology:
- `Total controls` counts grouped control surfaces in the current UI, not every repeated instance inside repeated rows like multiple powers or multiple attacks.
- `Unique selectable values` counts exact static, in-code option values only.
- Data-backed selectors are reported separately as dynamic collections because their runtime memberships are not fixed in the checked-out code.

## 1. Inventory Summary

- Total controls found: 72
- Total unique selectable values found: 116 static values, plus 13 dynamic data-backed selector collections
- Controls in Summoning Circle: 45
- Controls in Forge: 27
- Obvious duplicate concepts appearing in both tools:
  - Physical / Mental mode
  - Melee / Ranged / AoE range framing
  - Damage Types
  - Greater Success effects
  - Protection / defence concepts
  - Slot / location concepts
  - Tier concepts
  - Layout / print preset concepts
  - Tags and picker filters
  - Mythic / limit-break escalation concepts

## 2. Detailed Audit Table

| Tool | File | Component | Control Label | Control Type | User-visible Options / Values | Source of Values | Gameplay Critical? | Tooltip Needed? | Reason | Draft Canonical Tooltip Topic | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Monster search results | searchable picker list | Current campaign/core monster names with level, tier, source, tags | `refreshSummaries()` -> `GET /api/summoning-circle/monsters` | No | No | This is a record picker, not a rules choice. | Monster Picker | Same concept as Forge item picker. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Monster Level | chip group | `All`, `1-5`, `6-10`, `11-15`, `16-20`, exact chips `1..20` | Hardcoded arrays in component | No | No | Filter ranges are plain-language and operational. | Filter Range | Same interaction pattern as Forge item-level filters. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Tier | chip group | `Minion`, `Soldier`, `Elite`, `Boss` | `MONSTER_TIER_OPTIONS`, `MONSTER_TIER_LABELS` | Yes | Yes | Monster tier is system-specific and directly affects build expectations. | Monster Tier | `Tier` is overloaded elsewhere by limit-break tiers. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Exclude Legendary | checkbox | `checked` / `unchecked` | Local state only | No | No | The filter wording is already explicit. | Legendary Filter | Distinct from item rarity `LEGENDARY`. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Editor / Preview | segmented tabs | `Editor`, `Preview` | Hardcoded button labels | No | No | The UI meaning is obvious. | View Mode | Same pattern as Forge mobile toggle. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Level | select | `1..20` | `LEVEL_OPTIONS` | Yes | No | Numeric monster level is standard and self-explanatory. | Monster Level | Same label exists in Forge for item level. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Tier | select | `Minion`, `Soldier`, `Elite`, `Boss` | Hardcoded options | Yes | Yes | The label is short but the balance meaning is not obvious. | Monster Tier | Same wording as filter chips. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Legendary | checkbox | `checked` / `unchecked` | Monster boolean state | Maybe | Maybe | Users may not know mechanical impact from the label alone. | Legendary Status | Distinct from Forge item rarity. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Tag suggestions | suggestion list | Campaign and core tag suggestions | `GET /api/summoning-circle/tags` | No | No | Suggestions are plain labels, not rules terms. | Tag Suggestions | Input itself excluded; only selectable suggestions audited. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Available CORE Traits | chip group | Dynamic trait names, currently seeded with `Tough`, `Dangerous`, `Smart`, `Resilient`, `Courageous`, `Reliable` if DB empty | `GET /api/summoning-circle/traits` | Yes | Maybe | Trait names are short and their exact mechanical meaning may need hover help. | Trait Definition | Existing `title` usage already exposes effect text on chips. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Attribute Dice: `Attack / Defence / Fortitude / Intellect / Support / Bravery` | repeated select | `d4`, `d6`, `d8`, `d10`, `d12` | `DICE`, `dieLabel()` | Yes | Maybe | The attribute names already have hover tooltips, but die scale meaning may still need explanation. | Attribute Die | Existing label tooltips reduce urgency. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Hand Slots: `Main Hand / Off Hand / Small Slot` | repeated select | `None` plus campaign/core valid hand items | `GET /api/summoning-circle/weapons`, filtered by `isValidHandItemForSlot()` | Yes | Maybe | Slot names are clear, but item names alone may not explain weapon-source implications. | Hand Slot | Two-handed lockout adds hidden rules context. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Armor Slots: `Head Armor / Shoulder Armor / Torso Armor / Legs Armor / Feet Armor` | repeated select | `None` plus valid armor items for that body location | `GET /api/summoning-circle/weapons`, filtered by `isValidArmorItemForSlot()` | Yes | Yes | Location-driven equipment legality is system-specific. | Armor Location | Strong overlap with Forge `Armor Location`. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Item Slots: `Head Item / Neck Item / Arms Item / Belt Item` | repeated select | `None` plus valid accessory items for slot | `GET /api/summoning-circle/weapons`, filtered by `isValidItemAccessorySlot()` | Yes | Yes | Accessory location rules are not obvious from the labels alone. | Item Location | Good shared glossary candidate with Forge `Item Location`. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | `MELEE enabled / RANGED enabled / AOE enabled` | repeated checkbox | `checked` / `unchecked` | Natural attack config booleans | Yes | No | These are explicit activation toggles. | Attack Range Enable | `AOE` casing differs from some title-case labels elsewhere. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Melee Physical Strength / Melee Mental Strength | repeated select | `0..5` | `STRENGTH_OPTIONS` | Yes | Yes | Strength is a core damage-driving term but its scale is not explained in-label. | Strength | Same concept exists in Forge weapon builder. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Melee Targets | select | `1..5` | `TARGET_OPTIONS` | Maybe | No | The label is already plain-language. | Targets | Same concept appears in Forge and power range tuning. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Ranged Physical Strength / Ranged Mental Strength | repeated select | `0..5` | `STRENGTH_OPTIONS` | Yes | Yes | Same system-specific scale issue as melee strength. | Strength | Shared definition with Forge. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Ranged Targets | select | `1..5` | `TARGET_OPTIONS` | Maybe | No | Clear and ordinary wording. | Targets | Same option scale as melee targets. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Ranged Distance (ft) | radio pills | `30`, `60`, `120`, `200` | Inline numeric list via `renderRangePills()` | Maybe | No | The numbers are direct and concrete. | Range Distance | Same concept exists in Forge and power range tuning. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | AoE Physical Strength / AoE Mental Strength | repeated select | `0..5` | `STRENGTH_OPTIONS` | Yes | Yes | Same hidden scale issue as other strength selectors. | Strength | Shared definition with Forge. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | AoE Count | select | `1..5` | `TARGET_OPTIONS` | Maybe | Maybe | `Count` is short but not fully descriptive without system context. | AoE Count | Forge uses `AoE Count (number of areas)`, which is clearer. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | AoE Cast Range (ft) | radio pills | `0`, `30`, `60`, `120`, `200` | Inline numeric list via `renderRangePills()` | Maybe | Maybe | Range is clear, but `Cast Range` differs from Forge wording. | AoE Range | Forge says `AoE Center Range (ft)`. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Shape | select | `Sphere`, `Cone`, `Line` | Hardcoded options in component | Yes | Yes | Shape changes downstream geometry and attack interpretation. | AoE Shape | Forge uses uppercase `SPHERE / CONE / LINE`. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | AoE geometry: `Sphere Radius / Cone Length / Line Width / Line Length` | conditional radio groups | `10/20/30`, `15/30/60`, `5/10/15/20`, `30/60/90/120` | Inline numeric lists via `renderRangePills()` | Yes | Yes | Geometry controls are meaningful but terse. | AoE Geometry | Strong shared tooltip candidate with Forge. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Damage Types | chip group | Dynamic Forge damage types, filtered by allowed mode | `/api/forge/picklists` -> `damageTypes` | Yes | Yes | Damage type names are domain terms and affect attack-effect availability. | Damage Type | Same data source as Forge. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Greater Success Attack Effects | chip group | Dynamic Forge attack effects filtered by selected damage types | `/api/forge/picklists` -> `attackEffects` | Yes | Yes | `Greater Success` is core jargon and the effects are rules terms. | Greater Success | Forge uses `Greater Success – Melee/Ranged/AoE`. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Intention Type | select | `ATTACK`, `DEFENCE`, `HEALING`, `CLEANSE`, `CONTROL`, `MOVEMENT`, `AUGMENT`, `DEBUFF`, `SUMMON`, `TRANSFORMATION` | `INTENTIONS` | Yes | Yes | These are core power-builder archetypes with non-obvious mechanical consequences. | Intention Type | High-priority glossary candidate. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Applies To | select | `Primary Target(s)`, `Self` | Hardcoded options | Maybe | Maybe | Small selector, but targeting scope changes power valuation. | Target Scope | Only appears on secondary intentions. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Mode / Healing Mode | conditional select | `PHYSICAL / MENTAL` and `Physical / Mental` | `ATTACK_MODES` plus hardcoded healing options | Yes | Yes | Physical vs mental resolution is a cross-system concept that deserves one canonical explanation. | Physical vs Mental | Inconsistent casing between controls. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Power Damage Types | chip group | Dynamic Forge damage types filtered by current mode | `/api/forge/picklists` -> `damageTypes` | Yes | Yes | Same rules term problem as natural attack damage types. | Damage Type | Duplicate concept with Forge and natural attacks. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Control Mode / Cleanse Effect / Movement Type / Augment Stat / Debuff Stat | conditional select set | Control: `Force move`, `Force no move`, `Force specific action`, `Force no action`, `Force specific power`; Cleanse: `Active Power`, `Effect over time`, `Damage over time`, `Channelled Power`; Movement: `Force Push`, `Force Teleport`, `Force Fly`, `Run`, `Fly`, `Teleport`; Stat: `Attack`, `Defence`, `Fortitude`, `Intellect`, `Support`, `Bravery`, `Movement`, `Weapon Skill`, `Armor Skill`, `Dodge`, `Willpower` | Hardcoded arrays in component | Yes | Yes | These selectors are dense system vocabulary with little inline explanation. | Effect Mode | Several noun patterns compete: mode, type, effect, stat. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Range | chip group | `MELEE`, `RANGED`, `AOE` | `POWER_RANGE_CATEGORIES` | Yes | Yes | Range category drives which follow-up controls appear. | Range Category | Same concept as Forge `Range Categories`. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Melee Targets / Ranged Targets / AoE Count | repeated select | `1..5` | `POWER_RANGE_TARGET_OPTIONS` | Maybe | Maybe | The numbers are clear, but `AoE Count` is less obvious than the target counts. | Target Count | Forge labels AoE count more explicitly. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Ranged Distance / AoE Cast Range / AoE Shape / AoE geometry | mixed radio+select set | Distance `30/60/120/200`; Cast Range `0/30/60/120/200`; Shape `SPHERE/CONE/LINE`; geometry `10/20/30`, `15/30/60`, `5/10/15/20`, `30/60/90/120` | Hardcoded arrays in component | Yes | Yes | This is dense spatial jargon with real balance impact. | Range Geometry | Strong candidate for shared tooltips with natural attacks and Forge. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Duration | select | `Instant`, `Until target's next turn`, `Turns`, `Passive` | Hardcoded options in component | Yes | Maybe | Most values are readable, but duration timing still affects build cost and pacing. | Duration | `Passive` may need special clarification. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Response | checkbox | `checked` / `unchecked` | Power boolean state | Yes | Yes | `Response` is terse and system-specific. | Response | One of the least self-explanatory labels in the power editor. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Dice Count | select | `1..10` | `DICE_COUNT_OPTIONS` | Yes | Yes | The label names a quantity but not its power-budget meaning. | Dice Count | High-priority tuning term. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Potency | select | `1..5` | `POTENCY_OPTIONS` | Yes | Yes | `Potency` is core jargon and not self-defining. | Potency | High-priority tuning term. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Tier (Limit Break 1 / Limit Break 2) | repeated select | `None`, `PUSH`, `BREAK`, `TRANSCEND` | `LIMIT_BREAK_TIER_OPTIONS` | Yes | Yes | `Tier` here means escalation stage, not monster class. | Limit Break Tier | Strongly overloaded term in the same editor. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Attribute (Limit Break 1 / Limit Break 2) | repeated select | `None`, `Attack`, `Defence`, `Fortitude`, `Intellect`, `Support`, `Bravery` | `CORE_ATTRIBUTE_OPTIONS`, `CORE_ATTRIBUTE_LABELS` | Yes | Maybe | The stats are known elsewhere, but the limit-break threshold link is implicit. | Limit Break Attribute | Existing attribute tooltips help, but not in this context. |
| Summoning Circle | app/summoning-circle/components/MonsterCalculatorPanel.tsx | MonsterCalculatorPanel | Archetype | select | `BALANCED`, `GLASS_CANNON`, `TANK`, `CONTROLLER` | `ARCHETYPE_OPTIONS` | Maybe | Yes | Calculator archetypes are comparison targets, not everyday labels. | Archetype | Tooltip should explain these as benchmark profiles, not monster tags. |
| Summoning Circle | app/summoning-circle/components/SummoningCircleEditor.tsx | SummoningCircleEditor | Layout | select | `1 Page - Compact`, `2 Page - Legendary Layout` | Hardcoded options | No | Maybe | Print layout choice is understandable, but the tradeoff could use a short helper. | Print Layout | Same options reused in print mode. |
| Summoning Circle | app/summoning-circle/components/SummoningCirclePrintMode.tsx | SummoningCirclePrintMode | Layout | select | `1 Page - Compact`, `2 Page - Legendary Layout` | Hardcoded options | No | Maybe | Same reason as preview layout. | Print Layout | Repeated concept across editor preview and print page. |
| Summoning Circle | app/summoning-circle/components/SummoningCirclePrintMode.tsx | SummoningCirclePrintMode | Campaign Monsters | checkbox list | Current campaign monster names with `Level` and `Tier` | `GET /api/summoning-circle/monsters` + `GET /api/summoning-circle/monsters/[id]` | No | No | This is a print selection list, not a rules choice. | Print Selection | Operational control only. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Item search results | searchable picker list | Current campaign item names with rarity, level, type, tags | `useForgeItems()` -> `GET /api/forge/items` | No | No | This is a record picker, not a rules term. | Item Picker | Parallel to Summoning monster picker. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Item Level | chip group | `All`, `1-5`, `6-10`, `11-15`, `16-20`, exact chips `1..20` | Hardcoded arrays in component | No | No | Filter controls are obvious. | Filter Range | Same pattern as Summoning monster-level filters. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Exclude Legendary | checkbox | `checked` / `unchecked` | Local state only | No | No | Wording is direct. | Legendary Filter | Same wording as Summoning filter. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Editor / Preview | segmented tabs | `Editor`, `Preview` | Hardcoded button labels | No | No | Pure view toggle. | View Mode | Same mobile pattern as Summoning. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Tag suggestions | suggestion list | Campaign tag suggestions | `GET /api/forge/tags` | No | No | Suggestions are plain labels. | Tag Suggestions | No global tag source currently. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Rarity | select | `COMMON`, `UNCOMMON`, `RARE`, `LEGENDARY`, `MYTHIC` | `ITEM_RARITIES` | Yes | Yes | Rarity is a progression axis with budget implications. | Item Rarity | Distinct from monster `Legendary` checkbox. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Global Attribute Modifiers: Attribute | select | Dynamic attribute names, sourced from forge cost entries | `/api/forge/picklists` -> `costs` filtered to `category === attribute` | Yes | Yes | The attribute list is data-backed and mechanically meaningful. | Global Attribute Modifier | Same stat vocabulary overlaps with Summoning. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Global Attribute Modifiers: Amount | select | `+1`, `+2`, `+3`, `+4`, `+5` | Hardcoded numeric list in component | Yes | Maybe | The numbers are clear, but how much they matter is not. | Modifier Amount | Lower priority than the attribute names themselves. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Item Type | select | `WEAPON`, `ARMOR`, `SHIELD`, `ITEM`, `CONSUMABLE` | `ITEM_TYPES` | Yes | Yes | Item type gates the entire rest of the UI. | Item Type | `CONSUMABLE` is present but has no dedicated builder section yet. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Size | select | `Small`, `One Handed`, `Two Handed` | `WEAPON_SIZES`, `SIZE_LABELS` | Yes | Yes | Size affects equip rules and attack availability, but the meaning is not explained inline. | Weapon Size | Also used by shields. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Range Categories | chip group | `MELEE`, `RANGED`, `AOE` | `RANGE_CATEGORIES` | Yes | Yes | This selector unlocks most of the attack builder and is core jargon. | Range Category | Direct overlap with Summoning range categories. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Melee: Targets / Damage Types / Greater Success | mixed select+chips | Targets `1..5`; dynamic damage types grouped as `Physical Damage Types` and `Mental Damage Types`; dynamic attack effects filtered by chosen damage types | Targets hardcoded; damage types and effects from `/api/forge/picklists` | Yes | Yes | The static target count is clear, but the damage/effect terms and `Greater Success` are not. | Melee Attack Line | Physical/mental grouping is more explicit here than in Summoning. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Ranged: Targets / Distance / Damage Types / Greater Success | mixed select+radio+chips | Targets `1..5`; Distance `30/60/120/200`; dynamic damage types; dynamic attack effects | Targets/distance hardcoded; damage/effects from `/api/forge/picklists` | Yes | Yes | This is a dense attack-line builder with several system-specific terms. | Ranged Attack Line | Summoning uses the same underlying damage/effect lists. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | AoE: Center Range / Shape / Geometry / Damage Types / Greater Success | mixed radio+select+chips | Center Range `0/30/60/120/200`; Shape `SPHERE/CONE/LINE`; geometry `10/20/30`, `15/30/60`, `5/10/15/20`, `30/60/90/120`; dynamic damage types; dynamic attack effects | Mixed hardcoded arrays plus `/api/forge/picklists` | Yes | Yes | Several dense spatial and rules concepts stack in one area. | AoE Attack Line | Strongest shared tooltip cluster with Summoning. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Weapon Attributes | chip group | Dynamic weapon attribute names; some entries disable until range/shape prerequisites are met | `/api/forge/picklists` -> `weaponAttributes` | Yes | Yes | Attribute names are system-specific and often encode hidden rules. | Weapon Attribute | Disabled-state titles already hint at prerequisites. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Strength Source / Chosen Range (per attribute) | repeated select | `None`, `Melee`, `Ranged`, `AoE` | Hardcoded options shown for selected attributes requiring extra parameters | Yes | Yes | These are second-order configuration terms with no inline explanation. | Attribute Parameter Source | Same values appear with different casing elsewhere. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Limit Break | select | `None` plus dynamic template names grouped under `PUSH`, `BREAK`, `TRANSCEND` | `GET /api/forge/limit-break-templates` | Yes | Yes | Limit-break tiers and template names are high-impact and system-specific. | Mythic Limit Break | Shares terminology with Summoning limit breaks. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Armor Location | select | `HEAD`, `SHOULDERS`, `TORSO`, `LEGS`, `FEET` | Hardcoded list in component | Yes | Yes | Body-slot legality is a reusable concept, but labels are raw and uppercase here. | Armor Location | Summoning uses title-case armor slot labels instead. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Greater Success – Defence / Armor Attributes / Warding / Sanctified | chip groups | Dynamic defensive effect names, armor attribute names, warding option names, sanctified option names | `/api/forge/picklists` -> `defEffects`, `armorAttributes`, `wardingOptions`, `sanctifiedOptions` | Yes | Yes | All four controls contain system terms that are not self-defining. | Defensive Effects | `Warding` and `Sanctified` are especially opaque without glossary text. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Vulnerability / Resistance / Protection (VRP): Effect Kind / Damage Type | select pair | Effect Kind: `Vulnerability`, `Resistance`, `Protection`; Damage Type: dynamic Forge damage types | `VRPEffectKind` plus `/api/forge/picklists` -> `damageTypes` | Yes | Yes | `VRP` is shorthand and the three effect kinds are rules terms. | VRP | One of the highest-priority tooltip targets. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Shield has attack? | checkbox | `Yes, this shield can make attacks` | Shield boolean state | Yes | Maybe | Wording is clear, but enabling an attack-capable shield changes the whole form. | Attack-Capable Shield | Lower priority than the unlocked attack controls. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Shield Attributes | chip group | Dynamic shield attribute names | `/api/forge/picklists` -> `shieldAttributes` | Yes | Yes | Attribute names are rules vocabulary, not plain English. | Shield Attribute | Same issue as weapon and armor attributes. |
| Forge | app/forge/components/ForgeCreate.tsx | ForgeCreate | Item Location | select | `—` plus dynamic location names from forge config entries | `/api/forge/picklists` -> `config` filtered to `item_location` | Yes | Yes | Raw config labels are exposed directly with no display mapping or glossary. | Item Location | Overlaps with Summoning accessory slot concepts. |
| Forge | app/forge/components/ForgePrintMode.tsx | ForgePrintMode | Layout | select | `Standard (Portrait 2x2)`, `Verbose (Portrait 2x1)` | Hardcoded options | No | Maybe | The presets are readable, but the tradeoff is not obvious without the helper text. | Print Layout | Same concept class as Summoning print layouts, different naming. |
| Forge | app/forge/components/ForgePrintMode.tsx | ForgePrintMode | Campaign Forge Items | checkbox list | Current campaign items with rarity, type, level | `GET /api/forge/items` | No | No | Operational print selection only. | Print Selection | Parallel to Summoning print selection. |
| Forge | app/forge/edit/[id]/page.tsx | ForgeEditPage | Item Type | select | `WEAPON`, `ARMOR`, `SHIELD`, `ITEM` | `ITEM_TYPES` in legacy page | Yes | Yes | Same reasons as the main Forge item-type selector. | Item Type | Legacy standalone page omits `CONSUMABLE`. |
| Forge | app/forge/edit/[id]/page.tsx | ForgeEditPage | Rarity | select | `COMMON`, `UNCOMMON`, `RARE`, `LEGENDARY`, `MYTHIC` | `ITEM_RARITIES` in legacy page | Yes | Yes | Same reasons as the main Forge rarity selector. | Item Rarity | Legacy standalone page still exposes this selector. |

## 3. Grouped by Concept

### Damage / wound concepts

- Appears in:
  - Summoning Circle natural attacks: `Damage Types`, `Greater Success Attack Effects`
  - Summoning Circle powers: `Mode`, `Damage Types`, `Healing Mode`
  - Forge attack builder: `Damage Types – Melee/Ranged/AoE`, `Greater Success – Melee/Ranged/AoE`
  - Forge VRP builder: `Vulnerability / Resistance / Protection`
- Current wording consistency: partial.
- Shared tooltip opportunity: strong.
- Notes:
  - `PHYSICAL / MENTAL` appears in both tools, but casing and label style vary.
  - `Greater Success` is reused, but Forge suffixes it by range while Summoning uses `Greater Success Attack Effects`.

### Power valuation / tuning concepts

- Appears in:
  - Summoning Circle powers: `Dice Count`, `Potency`, `Response`, `Duration`
  - Forge armor/shields: `PPV`, `MPV`, `Aura (Physical)`, `Aura (Mental)`
  - Forge rarity and mythic limit-break selections
- Current wording consistency: low.
- Shared tooltip opportunity: moderate.
- Notes:
  - Summoning uses explicit builder jargon for powers.
  - Forge uses abbreviated protection-value jargon that never appears expanded in Summoning.

### Equipment slot / location concepts

- Appears in:
  - Summoning Circle equipped gear: hand slots, armor slots, item slots
  - Forge: `Armor Location`, `Item Location`, `Size`
- Current wording consistency: low.
- Shared tooltip opportunity: strong.
- Notes:
  - Summoning uses title-case slot labels like `Head Armor`, `Neck Item`.
  - Forge uses raw uppercase location values like `HEAD`, `SHOULDERS`, `TORSO`.

### Trait / descriptor concepts

- Appears in:
  - Summoning Circle: `Available CORE Traits`
  - Forge: `Weapon Attributes`, `Armor Attributes`, `Shield Attributes`, `Warding`, `Sanctified`
- Current wording consistency: low.
- Shared tooltip opportunity: moderate.
- Notes:
  - Summoning traits already expose some text via `title`.
  - Forge attribute chips often surface opaque names with no explanatory layer.

### Range / geometry concepts

- Appears in:
  - Summoning Circle natural attacks and powers: `MELEE / RANGED / AOE`, distance, cast range, shape, geometry
  - Forge attack builder: range categories, distances, AoE center range, shape, geometry
- Current wording consistency: mixed.
- Shared tooltip opportunity: very strong.
- Notes:
  - Forge uses `AoE Center Range (ft)`.
  - Summoning uses `AoE Cast Range (ft)`.
  - Forge shape options are uppercase; Summoning natural attacks use title case, powers use uppercase enum values in select options.

### Monster / item build concepts

- Appears in:
  - Summoning Circle: `Tier`, `Legendary`, `Level`, `Archetype`
  - Forge: `Rarity`, `Mythic` limit breaks, `Item Type`
- Current wording consistency: low because the underlying axes are different.
- Shared tooltip opportunity: partial.
- Notes:
  - `Tier` means monster class in one place and limit-break escalation in another.
  - `Legendary` is a monster flag, but `LEGENDARY` and `MYTHIC` are item rarities.

### Defensive outcome concepts

- Appears in:
  - Summoning Circle: derived `Physical Prot. & Weight`, `Mental Protection`, `Defence Strings`
  - Forge: `PPV`, `MPV`, `Greater Success – Defence`, `Warding`, `Sanctified`
- Current wording consistency: low.
- Shared tooltip opportunity: strong.
- Notes:
  - Summoning surfaces resolved protection outputs.
  - Forge asks the user to author the underlying stat values and tags.

### Print / layout concepts

- Appears in:
  - Summoning Circle preview and print mode
  - Forge print mode
- Current wording consistency: low.
- Shared tooltip opportunity: moderate.
- Notes:
  - Summoning uses `1 Page - Compact` and `2 Page - Legendary Layout`.
  - Forge uses `Standard (Portrait 2x2)` and `Verbose (Portrait 2x1)`.

## 4. High-Priority Tooltip Candidates

1. Protection Values (`PPV / MPV`)
   - Appears in Forge armor and shield builders.
   - Users see abbreviations without any in-UI expansion beyond the full label once.
   - Tooltip placement: control label.

2. Greater Success
   - Appears in Summoning attacks/powers and Forge attack/defence builders.
   - It is central combat jargon, but the UI assumes players already know what a greater success changes.
   - Tooltip placement: both control label and each option family.

3. VRP
   - Appears in Forge as `Vulnerability / Resistance / Protection (VRP)`.
   - The acronym and its conflict rules are not obvious from the label.
   - Tooltip placement: control label and effect-kind options.

4. Warding
   - Appears in Forge armor builder.
   - The name is flavorful but mechanically opaque.
   - Tooltip placement: control label and option values.

5. Sanctified
   - Appears in Forge armor builder.
   - Same problem as `Warding`; the term is not plain-language gameplay.
   - Tooltip placement: control label and option values.

6. Weapon Attributes
   - Appears in Forge weapon builder.
   - Attribute names likely encode rules text or magnitude assumptions that are not visible in the chip label.
   - Tooltip placement: each option value.

7. Armor Attributes
   - Appears in Forge armor builder.
   - Same issue as weapon attributes, plus PPV/MPV gating.
   - Tooltip placement: each option value.

8. Shield Attributes
   - Appears in Forge shield builder.
   - Same issue as other attribute families.
   - Tooltip placement: each option value.

9. Monster Tier
   - Appears in Summoning filters and monster editor.
   - `Minion / Soldier / Elite / Boss` are balance classes, not everyday labels.
   - Tooltip placement: control label and each option.

10. Limit Break Tier
   - Appears in Summoning limit breaks and Forge mythic template grouping.
   - `PUSH / BREAK / TRANSCEND` are opaque without a glossary definition.
   - Tooltip placement: control label and each option.

11. Range Category (`MELEE / RANGED / AOE`)
   - Appears in Summoning powers, Summoning natural attacks, and Forge attack builder.
   - The categories are familiar, but downstream rule consequences vary by tool.
   - Tooltip placement: control label.

12. AoE Shape and Geometry
   - Appears in Summoning and Forge.
   - `Sphere`, `Cone`, `Line` are readable, but the game-space implications are not.
   - Tooltip placement: control label and each shape option.

13. Physical vs Mental
   - Appears in modes, healing, damage-type groupings, and damage-type data.
   - This is a shared rules axis that drives defence, damage typing, and several picklists.
   - Tooltip placement: control label.

14. Equipment / Item Location
   - Appears in Summoning gear slots and Forge `Armor Location` / `Item Location`.
   - Users can infer body placement, but not always slot legality, overlap, or why locations differ between tools.
   - Tooltip placement: control label.

15. Power Tuning (`Dice Count / Potency / Response`)
   - Appears in Summoning power builder.
   - These labels are very short and mechanically important, especially `Response`.
   - Tooltip placement: control label.

## 5. Low-Priority / No-Tooltip Controls

- `Editor / Preview` mobile tabs in both tools are already obvious.
- Monster and item search result lists are operational pickers, not rules concepts.
- Level quick-range filters (`All`, `1-5`, `6-10`, `11-15`, `16-20`) are self-explanatory.
- Exact level chips (`1..20`) in picker filters do not need tooltip text.
- `Exclude Legendary` is clear in both tools.
- Print selection checkbox lists (`Campaign Monsters`, `Campaign Forge Items`) are straightforward operational controls.
- `Melee Targets` and `Ranged Targets` are mostly plain-language, unless you want a broader glossary pass on target-count rules.
- Layout selectors probably need helper text at most, not formal per-option tooltip treatment.

## 6. Inconsistency Findings

- `Tier` means two different things inside Summoning Circle:
  - Monster class: `Minion / Soldier / Elite / Boss`
  - Limit-break escalation: `PUSH / BREAK / TRANSCEND`

- AoE range wording differs across tools:
  - Forge: `AoE Center Range (ft)`
  - Summoning: `AoE Cast Range (ft)`

- Greater-success wording differs across tools:
  - Forge: `Greater Success – Melee/Ranged/AoE`, `Greater Success – Defence`
  - Summoning: `Greater Success Attack Effects`

- Protection wording differs sharply across tools:
  - Forge: `Physical Protection Value (PPV)`, `Mental Protection Value (MPV)`
  - Summoning: `Physical Prot. & Weight`, `Mental Protection`

- Shape/value casing is inconsistent:
  - Forge exposes `SPHERE / CONE / LINE` and `MELEE / RANGED / AOE`
  - Summoning mixes `Sphere / Cone / Line`, `MELEE / RANGED / AOE`, and title-case labels like `AoE`

- Physical/mental casing is inconsistent:
  - `PHYSICAL / MENTAL`
  - `Physical / Mental`
  - `Physical Damage Types / Mental Damage Types`

- `Movement Type` vs `Control Mode` vs `Cleanse Effect` vs `Healing Mode` describe the same style of choice with different noun patterns.

- Forge `Item Type` includes `CONSUMABLE`, but the current `ForgeCreate` UI has no consumable-specific follow-up controls.

- Equipment/location naming is split between raw config or enum text and curated labels:
  - Forge `Armor Location`: `HEAD / SHOULDERS / TORSO / LEGS / FEET`
  - Summoning uses humanized slot labels like `Head Armor`, `Shoulder Armor`, `Head Item`, `Neck Item`

- `Legendary` is overloaded across domains:
  - Summoning: monster boolean flag
  - Forge: item rarity `LEGENDARY`
  - Forge also adds `MYTHIC`, which has no direct monster equivalent in this UI

- Shared damage/effect data is presented differently:
  - Forge damage types are explicitly grouped as `Physical Damage Types` and `Mental Damage Types`
  - Summoning damage-type chips are filtered by mode but not always grouped with that same phrasing
