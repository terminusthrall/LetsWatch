<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# LetsWatch — Agent Guide

## Product Summary

LetsWatch is a group movie-decision app. A host creates a swipe session from a TMDB-powered pool, guests join with a six-character code, and everyone swipes through media. A unanimous LIKE becomes a match. If one clear winner emerges from likes, the session completes; otherwise the tied top media enter a head-to-head vote. The full product and protocol spec lives in `docs/specification.md`.

## Tech Stack

- **Framework:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- **Database:** Drizzle ORM + Neon Postgres (`src/db/`)
- **Cache / realtime state:** Upstash Redis (`src/modules/redis/`)
- **Media metadata:** TMDB API (`src/modules/tmdb/`)
- **Validation:** Zod
- **Testing:** Vitest

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run lint         # ESLint
npm test             # vitest run
npx drizzle-kit generate
npx drizzle-kit migrate
```

## Directory Map

- `src/app/api/` — route handlers (session lifecycle, swipes, head-to-head, join)
- `src/app/` — App Router pages and layouts
- `src/modules/sessions/` — session creation, deadline math, resolution helpers
- `src/modules/swiping/` — swipe logic and match detection
- `src/modules/head-to-head/` — head-to-head pair/vote/standings helpers
- `src/modules/tmdb/` — TMDB search and media mapping
- `src/modules/redis/` — Upstash Redis client and session state helpers
- `src/modules/auth/` — participant auth helpers
- `src/db/` — Drizzle schema, client, and migrations
- `src/types/` — shared TypeScript contracts
- `docs/` — product specification and architecture docs

## Conventions

1. Validate every API body with Zod `safeParse` and return `{ error: string }` JSON on failure.
2. Participant auth is via the `user_session` httpOnly JWT cookie; use `getAuthenticatedParticipant(request, sessionId)`.
3. Redis, Postgres, and TMDB clients are lazy env-checked singletons (`getRedis`, `getDb`, `getTmdb`). Never instantiate them at module top level.
4. `server-only` modules and DB/Redis/TMDB helpers must not be imported by `'use client'` files. Keep data fetching in Server Components or route handlers.
5. Prefer `safeParse` + early returns over throwing for expected invalid input.
6. Only add permissively licensed dependencies (MIT / Apache-2.0 / BSD). Avoid GPL, proprietary, or copyleft packages.

## Session State Machine

```
SWIPING_ACTIVE
  → HEAD_TO_HEAD_ACTIVE (on deadline/end when >= 2 tied top likes)
  → COMPLETED (unanimous single match, single top like, or head-to-head leader resolved)
  → DEADLINE_RESOLVED (no likes / no matches)
```

Transitions happen in:

- `src/app/api/sessions/[id]/swipe/route.ts` — swipes can mark media as `isMatched` and trigger transition when all participants finish.
- `src/app/api/sessions/[id]/end/route.ts` — host manually ends swiping and resolves from like counts.
- `src/app/api/sessions/[id]/route.ts` — `GET` lazily resolves `SWIPING_ACTIVE` or `HEAD_TO_HEAD_ACTIVE` when `deadlineAt` has passed.

For implementation details, see `docs/specification.md`.

## Pull Request / Merge Policy

- Do **not** merge pull requests or run any `gh pr merge` / auto-merge command.
- When a task is complete, push the branch and open a pull request.
- Provide the PR URL and wait for the user to review and merge it themselves.
