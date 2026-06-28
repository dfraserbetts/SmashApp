Core entities (not join tables)

ItemTemplate — the forged item instance (type + fields like PPV/MPV, names, text, etc.)

WeaponAttribute — admin-authored weapon attribute definitions + descriptorTemplate + requirement flags

ArmorAttribute — admin-authored armor attribute definitions + descriptorTemplate + requirement flags

ShieldAttribute — admin-authored shield attribute definitions + descriptorTemplate + requirement flags

DamageType — canonical damage types

AttackEffect — canonical attack effects for attack actions

DefEffect — canonical defence effects (greater defence mapping)

WardingOption — warding picklist options (used by Warding templates)

SanctifiedOption — sanctified picklist options (used by Sanctified templates)

ForgeConfigEntry — general forge config rows (category + selector1/2/3 + etc)

ForgeCostEntry — costs matrix rows (category + selector1/2/3 + value)

DescriptorRule — rules/templating support (if still used; keep as-is)

Campaign, CampaignUser, CampaignUsers — campaign ownership/membership

UserProfile — user record / entitlements

Join tables (association tables; these are your “per item per selection” storage)

ItemTemplateWeaponAttribute — ItemTemplate ↔ WeaponAttribute (+ strengthSource, rangeSource, etc)

ItemTemplateArmorAttribute — ItemTemplate ↔ ArmorAttribute

ItemTemplateShieldAttribute — ItemTemplate ↔ ShieldAttribute

ItemTemplateVRPEntry — ItemTemplate ↔ VRP rows (damage type + vuln/res/prot values)

ItemTemplateDefEffect — ItemTemplate ↔ DefEffect selections

ItemTemplateRangeCategory — ItemTemplate ↔ selected ranges (melee/ranged/aoe)

ItemTemplateAttackEffectAoE — ItemTemplate ↔ AoE attack effects

ItemTemplateAttackEffectMelee — ItemTemplate ↔ melee attack effects

ItemTemplateAttackEffectRanged — ItemTemplate ↔ ranged attack effects

ItemTemplateAoEDamageType — ItemTemplate ↔ AoE damage types

ItemTemplateMeleeDamageType — ItemTemplate ↔ melee damage types

ItemTemplateRangedDamageType — ItemTemplate ↔ ranged damage types

ItemTemplateWardingOption — ItemTemplate ↔ WardingOption selections (and/or values)

ItemTemplateSanctifiedOption — ItemTemplate ↔ SanctifiedOption selections (and/or values)