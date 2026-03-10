import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const initialEnvKeys = new Set(Object.keys(process.env));
const envFiles = [
  { path: path.join(repoRoot, '.env'), override: false },
  { path: path.join(repoRoot, '.env.local'), override: true },
];
const loadedEnvKeys = new Set();

function loadEnvFile(envFilePath, { override }) {
  if (!fs.existsSync(envFilePath)) {
    return;
  }

  const parsedEnv = parseDotenv(fs.readFileSync(envFilePath));

  for (const [key, value] of Object.entries(parsedEnv)) {
    if (initialEnvKeys.has(key)) {
      continue;
    }

    if (!loadedEnvKeys.has(key) || override) {
      process.env[key] = value;
      loadedEnvKeys.add(key);
    }
  }
}

function runPrisma(args, env) {
  const result = spawnSync('npx', ['prisma', ...args], {
    cwd: repoRoot,
    env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
    windowsHide: true,
  });

  if (typeof result.status === 'number') {
    return result.status;
  }

  if (result.error) {
    console.error(result.error.message);
  }
  return 1;
}

console.log('Loading env...');
for (const envFile of envFiles) {
  loadEnvFile(envFile.path, { override: envFile.override });
}

const directUrl = process.env.DIRECT_URL?.trim();
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL?.trim();

if (!directUrl) {
  console.error('DIRECT_URL is required for shadow-safe Prisma migrate dev.');
  process.exit(1);
}

if (!shadowDatabaseUrl) {
  console.error(
    'SHADOW_DATABASE_URL is required for shadow-safe Prisma migrate dev.',
  );
  process.exit(1);
}

console.log('Bootstrapping shadow DB...');
const bootstrapStatus = runPrisma(
  ['db', 'execute', '--file', 'prisma/shadow-bootstrap.sql'],
  {
    ...process.env,
    DIRECT_URL: shadowDatabaseUrl,
  },
);

if (bootstrapStatus !== 0) {
  console.error('Shadow DB bootstrap failed.');
  process.exit(bootstrapStatus);
}

console.log('Running prisma migrate dev...');
const migrateStatus = runPrisma(['migrate', 'dev', ...process.argv.slice(2)], {
  ...process.env,
  DIRECT_URL: directUrl,
  SHADOW_DATABASE_URL: shadowDatabaseUrl,
});

if (migrateStatus !== 0) {
  console.error('Prisma migrate dev failed.');
  process.exit(migrateStatus);
}
