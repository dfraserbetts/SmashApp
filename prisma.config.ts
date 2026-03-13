import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL?.trim() || undefined;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // 👇 this is the crucial part – run our CJS seed file
    seed: 'node prisma/seed.cjs',
  },
  datasource: {
    // Use DIRECT_URL for migrations (5432 direct connection)
    url: env('DIRECT_URL'),
    shadowDatabaseUrl,
  },
});
