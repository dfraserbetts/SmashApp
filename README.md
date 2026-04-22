# SmashApp

SmashApp is a Next.js 16 app backed by Supabase and Prisma.

## Local Development

1. Copy `.env.example` to `.env.local` and fill in the real values.
2. Install dependencies with `npm ci`.
3. Start the app with `npm run dev`.
   The dev launcher now auto-restarts Next when Prisma/runtime files change, which helps clear stale local server state after schema, migration, or Prisma client patches.

The app expects Node 22. `.nvmrc` is included so GitHub Actions, local shells, and Vercel can stay aligned.

## Environment Variables

Required in local development and Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`

Local-only helper:

- `SHADOW_DATABASE_URL`
  Used by `npm run prisma:migrate:dev:safe`. It is not required for Vercel production deploys.

## GitHub + Vercel Deployment

The repository is already structured for Vercel:

- `vercel.json` uses the Next.js framework preset.
- Production builds run `npm run build:vercel`.
- `build:vercel` applies Prisma migrations with `prisma migrate deploy` before `next build`.
- `.github/workflows/build.yml` runs a GitHub build check on pushes and pull requests.

To wire a fresh GitHub/Vercel setup:

1. Push the repo to GitHub.
2. Import the GitHub repository into Vercel.
3. Add the environment variables from `.env.example` in Vercel for `Development`, `Preview`, and `Production`.
4. Trigger the first deployment.

Useful Vercel CLI commands:

```bash
npx vercel pull --yes
npx vercel env ls
npx vercel build
```

## Notes

- The `/forge/create` redirect now lives in `next.config.ts`, which keeps deployment behavior consistent before filesystem routes run.
- The project uses `proxy.ts`, which matches the current Next.js 16 file convention replacing `middleware.ts`.
