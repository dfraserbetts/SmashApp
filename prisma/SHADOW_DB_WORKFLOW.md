## Shadow DB workflow

Older Supabase-style RLS migrations in this repo reference `auth.uid()` and `TO authenticated`, so Prisma shadow replay needs a small bootstrap.

Required env vars:
- `DIRECT_URL`
- `SHADOW_DATABASE_URL`

Use this command for future dev migrations:

```bash
npm run prisma:migrate:dev:safe -- --name your_migration_name
```

This bootstraps the shadow database first, then runs `prisma migrate dev`.

`npx prisma migrate deploy` remains the normal runtime / production migration path.
