# LetsWatch

A group movie-decision app. Hosts create swipe sessions, guests join with a six-character code, and everyone swipes through TMDB-powered media. Unanimous likes become matches; ties are settled with head-to-head voting.

## Setup

Copy .env.example to .env.local and fill in:

- DATABASE_URL — Neon Postgres connection string
- UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
- TMDB_API_KEY
- JWT_SECRET

Then run:

`ash
npm install
npx drizzle-kit migrate
npm run dev
`

See AGENTS.md for the agent guide and docs/ for the full product specification.
