// prisma/seed.cjs
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// Use the pooled DATABASE_URL for Prisma Client
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

// Prisma 7: must pass an adapter
const prisma = new PrismaClient({ adapter });

function readCsv(name) {
  const filePath = path.join(__dirname, 'seed', name);
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(',').map((h) => h.trim());

  return rows.map((line) => {
    const cols = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cols[i] || '').trim();
    });
    return obj;
  });
}

// ----------------------------------------
// Picklists → lookup tables
// ----------------------------------------
async function seedPicklists() {
  const rows = readCsv('ForgePicklists.csv');
  const seen = new Set();

  async function addUnique(value, keyPrefix, fn) {
    if (!value) return;
    const v = value.trim();
    if (!v) return;
    const key = `${keyPrefix}:${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    await fn(v);
  }

  for (const row of rows) {
    await addUnique(row.DmgType, 'DamageType', (name) =>
      prisma.damageType.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    );

    await addUnique(row.GS_AttackEffects, 'AttackEffect', (name) =>
      prisma.attackEffect.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    );

    await addUnique(row.GS_DefEffects, 'DefEffect', (name) =>
      prisma.defEffect.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    );

    await addUnique(row.WeaponAttributes, 'WeaponAttribute', (name) =>
      prisma.weaponAttribute.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    );

    await addUnique(row.ArmorAttributes, 'ArmorAttribute', (name) =>
      prisma.armorAttribute.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    );

    await addUnique(row.ShieldAttributes, 'ShieldAttribute', (name) =>
      prisma.shieldAttribute.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    );

    await addUnique(row.WardingOptions, 'WardingOption', (name) =>
      prisma.wardingOption.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    );

    await addUnique(row.SanctifiedOptions, 'SanctifiedOption', (name) =>
      prisma.sanctifiedOption.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    );
  }
}

// ----------------------------------------
// ForgeConfig (multipliers)
// ----------------------------------------
async function seedConfig() {
  const rows = readCsv('ForgeConfig.csv');

  // Nuke and repopulate – this table is pure config
  await prisma.forgeConfigEntry.deleteMany();

  for (const row of rows) {
    const categoryRaw = (row['Category'] || '').trim();
    const selector1 = (row['Selector 1'] || '').trim();
    const selector2 = (row['Selector 2'] || '').trim() || null;
    const valueRaw = (row['Value'] || '').trim();

    if (!categoryRaw || !selector1 || !valueRaw) continue;

    const value = parseFloat(valueRaw);
    if (Number.isNaN(value)) continue;

    let category;
    switch (categoryRaw) {
      case 'Rarity':
        category = 'RARITY';
        break;
      case 'Size':
        category = 'SIZE';
        break;
      case 'ArmorLocation':
        category = 'ARMOR_LOCATION';
        break;
      case 'ItemLocation':
        category = 'ITEM_LOCATION';
        break;
      default:
        continue; // ignore unknown categories
    }

    await prisma.forgeConfigEntry.create({
      data: {
        category,
        selector1,
        selector2,
        value,
      },
    });
  }
}

// ----------------------------------------
// ForgeCosts (cost rules)
// ----------------------------------------
async function seedCosts() {
  const rows = readCsv('ForgeCosts.csv');

  // Same deal: pure config, safe to wipe and reinsert
  await prisma.forgeCostEntry.deleteMany();

  for (const row of rows) {
    const category = (row['Category'] || '').trim();
    const selector1 = (row['Selector 1'] || '').trim();
    const selector2 = (row['Selector 2'] || '').trim() || null;
    const selector3 = (row['Selector 3'] || '').trim() || null;
    const valueRaw = (row['Value'] || '').trim();
    const notes = (row['Notes'] || '').trim() || null;

    if (!category || !selector1 || !valueRaw) continue;

    const value = parseFloat(valueRaw);
    if (Number.isNaN(value)) continue;

    // category string must match ForgeCostCategory enum exactly
    await prisma.forgeCostEntry.create({
      data: {
        category,
        selector1,
        selector2,
        selector3,
        value,
        notes,
      },
    });
  }
}

// ----------------------------------------
// Limit Break reference data
// ----------------------------------------
async function seedLimitBreakReferenceData() {
  const effectKeys = [
    'LB_EFFECT_DAMAGE_SPIKE',
    'LB_EFFECT_FORCED_MOVEMENT',
    'LB_EFFECT_TEAM_UTILITY',
  ];

  const consequenceKeys = [
    'LB_COST_SELF_EXPOSED',
    'LB_COST_RESOURCE_DRAIN',
    'LB_COST_POSITIONAL_LOCK',
  ];

  for (const key of effectKeys) {
    await prisma.limitBreakEffect.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }

  for (const key of consequenceKeys) {
    await prisma.limitBreakConsequence.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
}

async function main() {
  await seedPicklists();
  await seedConfig();
  await seedCosts();
  await seedLimitBreakReferenceData();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
