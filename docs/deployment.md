# Production Deployment Summary

## Environment Variables

Copy `.env.example` to `.env.local` (or set these directly in Vercel) and fill in real values for each key.

| Variable | Source | Purpose |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL | Postgres connection string for Drizzle ORM and migrations |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis | REST endpoint for the Redis session state engine |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis | REST API token for Upstash |
| `TMDB_API_KEY` | TMDB | API key for discovering movies/shows and fetching details |
| `JWT_SECRET` | Generate locally | Secret used to sign the `user_session` HTTP-only JWT cookie |

## Vercel Import Steps

1. Go to https://vercel.com/new and select **Import Git Repository**.
2. Choose `terminusthrall/LetsWatch` and authorize Vercel if prompted.
3. Set the **Framework Preset** to `Next.js` if it is not auto-detected.
4. Add the environment variables listed above in the project settings under **Environment Variables**.
5. Run `npx drizzle-kit push` (or apply the `drizzle/` migrations) against your production `DATABASE_URL` before the first deploy.
6. Click **Deploy**.

## Post-Deploy Checks

- `npx tsc --noEmit` passes
- `npm run build` completes with no errors
- `npx drizzle-kit check` reports no migration drift
