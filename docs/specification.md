# [v5.1] PRD & Technical Design Document: Movie & Show Group Decision Platform

**Project Name:** Movie & Show Group Decision & Recommendation Platform

**Document Version:** v5.1 — Reconciled schema, Redis, and API contracts with implementation

**Document Owner:** Cameron Moore

**Status:** Approved Active Specification

## 1. Executive Summary & Core Architectural Tenets

### 1.1 Product Vision
To eliminate "scroll paralysis" and ongoing debates around choosing movies and TV shows for both individual viewers and groups. The platform provides personalized individual recommendations while offering a streamlined, asynchronous consensus mechanism for group viewing.

### 1.2 Core Architectural Principles
- **AI-Driven Modular Architecture:** Code must be structured into simple, decoupled modules with strict, typed TypeScript interface contracts (Zod schemas) so AI coding tools (Cursor, Windsurf, Claude Code) can write and refactor code without cross-module state pollution.
- **100% Commercial-Friendly Licensing:** All frameworks, libraries, ORMs, and APIs must strictly use permissive licenses (MIT, Apache 2.0, BSD) or approved commercial API agreements. No GPL, AGPL, or non-commercial restrictions are permitted.
- **Privacy Laws & Compliance (GDPR/CCPA):** Zero mandatory PII for guest swiping. Ephemeral display names and signed session JWTs are used without collecting or storing emails, phone numbers, or passwords.
- **Safety & Security First:** API boundary schema validation, strict input sanitization, rate limiting on metadata endpoints, and sandboxed iframe isolation for display ad units.

## 2. Core Product Features & Asynchronous Workflow

### 2.1 Host Deck Creation & Metadata
- **TMDB Fast Search:** Autocomplete search bar supporting title, release year, poster thumbnail, and logline powered by TMDB API.
- **Manual Custom Deck:** Hosts assemble custom swipe decks by searching and adding titles.
- **Dynamic Lists:** Quick-add content from "What's Hot / Trending" lists as well as basic user preferences.

### 2.2 Asynchronous Swiping & Continuous Deck Evaluation
- **Zero-Barrier Access:** Guests join via persistent invite links or QR codes using temporary display names without account creation.
- **Non-Blocking Match Alerts:** When all active participants swipe right on a title, an in-app banner/toast or Web Push alert ("Match Found!") is dispatched. Swiping is not frozen or forced to end; users continue evaluating the rest of the deck pool at their own pace before the session deadline.

### 2.3 Matched Pool Review & Head-to-Head Final Stage
- **Pool Completion:** Once all participants finish swiping (or the deadline expires), the session transitions from SWIPING_ACTIVE to HEAD_TO_HEAD_ACTIVE.
- **Single Match:** Declared the instant winning pick upon pool completion.
- **Multiple Matches or Zero Unanimous Matches:** All matched titles (or top consensus picks if no 100% match occurred) populate a "Winners Pool". Participants enter a quick 1v1 Head-to-Head comparison round or ranked-choice vote to crown the single 1st place winner.

## 3. Progressive Account Strategy & Onboarding

- **v1 MVP Ephemeral Guest Model:** Guests tap an invite link, enter a display name, and receive an encrypted HTTP-only JWT storing an ephemeral userId and sessionId. Zero passwords or emails collected.
- **Post-MVP Frictionless Conversion:** Upon completing a session, users receive a prompt: "Loved this session? Claim your account to save your display name and match history."
- **Self-Hosted MIT Auth Engine:** Powered by Better Auth or Auth.js (v5) running directly inside PostgreSQL via Drizzle ORM. Eliminates third-party per-MAU vendor fees (e.g., Auth0 / Clerk).

## 4. Phased Monetization Strategy & Reserved Ad Zones

### 4.1 "Reserved Ad Zone" UI Strategy
The UI is designed from Day 1 with explicit, fixed-height "Reserved Ad Containers" (Header Leaderboard 728x90, Lobby Rectangle 300x250, Sticky Footer 320x50). During early non-monetized growth, these slots display non-intrusive product tips or featured genre cards. When monetization turns on, ad networks fill these containers smoothly with zero layout reflow. All display ads automatically unmount/hide during active swiping gestures to protect touch interactions.

### 4.2 Monetization Phase Rollout
- **Phase 1 (Free Growth):** Banners & affiliate links are OFF. Operational costs remain capped at ~$15 – $35/month for thousands of users using TMDB's Free Developer Tier (with required logo attribution).
- **Phase 2 (Ad & Affiliate Launch):** Programmatic display ad banners fill reserved containers. Outgoing JustWatch links earn rental/streaming referral commissions. TMDB Commercial API license ($149/mo) activates upon monetization.
- **Phase 3 (Premium Subscription Tiers):**
  - Ad-Free Monthly: $1.99 / month (Impulse-buy micro-subscription; ~$1.62 net profit after Stripe fees).
  - Ad-Free Annual (Best Value): $11.99 / year ($0.99/mo equivalent; maximizes upfront cash flow).
  - Lifetime Pass: $19.99 one-time.
  - Pro Host Group Perk: When a paid Pro Host creates a room, display ads are automatically disabled for all guests in that session.

## 5. Engineering Plan & Technical Specification

### 5.1 Tech Stack & License Audit
- **Framework:** Next.js (App Router) — MIT License
- **Database & ORM:** PostgreSQL + Drizzle ORM — Apache 2.0 / MIT License
- **Auth Engine:** Better Auth / Auth.js (v5) — MIT License
- **Boundary Validation:** Zod — MIT License
- **State & Locks:** Upstash Redis (HTTP SDK) — Apache 2.0 / Commercial Agreement
- **Metadata & Availability:** TMDB API v3 & JustWatch API — Commercial Agreements

### 5.2 Complete Database Schema (src/db/schema.ts)

```typescript
import { pgTable, uuid, varchar, timestamp, integer, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const voteEnum = pgEnum('vote_direction', ['LIKE', 'PASS']);  
export const sessionStatusEnum = pgEnum('session_status', ['SWIPING_ACTIVE', 'HEAD_TO_HEAD_ACTIVE', 'DEADLINE_RESOLVED', 'COMPLETED']);  
// `DEADLINE_RESOLVED` applies once the deadline passes and no winning media can be determined (no likes or an unresolved head-to-head tie).

// 1. Users & Accounts Schema (Ephemeral Guests & Pro Subscribers)
export const users = pgTable('users', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  displayName: varchar('display_name', { length: 50 }).notNull(),  
  email: varchar('email', { length: 255 }),
  isGuest: integer('is_guest').default(1).notNull(), // 1 = Ephemeral Guest, 0 = Registered Account
  isProSubscriber: integer('is_pro_subscriber').default(0).notNull(), // 1 = Paid Ad-Free / Pro Host
  createdAt: timestamp('created_at').defaultNow().notNull(),  
});  

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(), // 'google' | 'apple' | 'email'
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_accounts_user_id').on(table.userId),
]);

// 2. Swiping Sessions
export const sessions = pgTable('sessions', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  hostId: uuid('host_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),  
  title: varchar('title', { length: 100 }).default('Movie Night').notNull(),  
  joinCode: varchar('join_code', { length: 6 }),  
  status: sessionStatusEnum('status').default('SWIPING_ACTIVE').notNull(),  
  finalWinningMediaId: varchar('final_winning_media_id', { length: 50 }),  
  deadlineAt: timestamp('deadline_at').notNull(),  
  createdAt: timestamp('created_at').defaultNow().notNull(),  
}, (table) => [
  index('idx_sessions_host_id').on(table.hostId),
  uniqueIndex('idx_sessions_join_code').on(table.joinCode),
]);  

// 2.5. Session Participants (source of truth)
export const sessionParticipants = pgTable('session_participants', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),  
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),  
  joinedAt: timestamp('joined_at').defaultNow().notNull(),  
}, (table) => [  
  index('idx_session_participants_session_id').on(table.sessionId),  
  uniqueIndex('uniq_session_participant').on(table.sessionId, table.userId),  
]);  

// 3. Session Media Pool
export const sessionMedia = pgTable('session_media', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),  
  tmdbId: varchar('tmdb_id', { length: 50 }).notNull(),  
  mediaType: varchar('media_type', { length: 10 }).notNull(), // 'movie' | 'tv'  
  title: varchar('title', { length: 255 }).notNull(),  
  posterPath: varchar('poster_path', { length: 255 }),  
  releaseYear: varchar('release_year', { length: 10 }),  
  overview: varchar('overview', { length: 1000 }),  
  isMatched: integer('is_matched').default(0).notNull(), // 1 when unanimous match occurs  
  addedAt: timestamp('added_at').defaultNow().notNull(),  
}, (table) => [
  index('idx_session_media_session_id').on(table.sessionId),
  uniqueIndex('uniq_session_tmdb').on(table.sessionId, table.tmdbId),
]);  

// 4. Swipes & Head-to-Head Votes
export const swipes = pgTable('swipes', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),  
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),  
  mediaId: uuid('media_id').references(() => sessionMedia.id, { onDelete: 'cascade' }).notNull(),  
  vote: voteEnum('vote').notNull(),  
  createdAt: timestamp('created_at').defaultNow().notNull(),  
}, (table) => [
  index('idx_swipes_session_user').on(table.sessionId, table.userId),
  uniqueIndex('uniq_user_swipe').on(table.sessionId, table.userId, table.mediaId),
]);  

export const headToHeadVotes = pgTable('head_to_head_votes', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),  
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),  
  preferredMediaId: uuid('preferred_media_id').references(() => sessionMedia.id, { onDelete: 'cascade' }).notNull(),  
  opponentMediaId: uuid('opponent_media_id').references(() => sessionMedia.id, { onDelete: 'cascade' }).notNull(),  
  createdAt: timestamp('created_at').defaultNow().notNull(),  
}, (table) => [
  index('idx_h2h_session_user').on(table.sessionId, table.userId),
]);

// 5. Zod Validation Contracts for API Boundaries
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const insertSessionSchema = createInsertSchema(sessions);
export const selectSessionSchema = createSelectSchema(sessions);

export const insertSwipeSchema = createInsertSchema(swipes);
export const selectSwipeSchema = createSelectSchema(swipes);
```
### 5.3 Session State Engine, Distributed Locks & Redis Architecture (src/modules/redis/)

To avoid read/write lock contention on PostgreSQL during swipe bursts, the app uses Upstash Redis as a hot cache. The durable source of truth for participants is the `session_participants` table; the Redis participant set is primed at read time (or on join) and used for sub-millisecond counts.

#### 5.3.1 Key-Value Data Structures & Naming Conventions

- **`session_participants:{sessionId}`** — Redis Set of `userId` strings (SADD, SMEMBERS, SCARD). TTL = `max(24h, remaining-to-deadline + 24h)` via `getSessionRedisTtlSeconds`.
- **`session:{sessionId}:media:{mediaId}:likes`** — Redis Set of `userId` strings who liked the media. Count is read via `SCARD` and verified with `SINTER` against the participant set. TTL set by caller (default 3600s).
- **`session_matches:{sessionId}`** — Redis Set of matched `sessionMedia.id` strings. TTL set by caller (default 3600s).
- **`session_winner:{sessionId}`** — Redis String/JSON cached winner payload. TTL 24h.
- **`session_lock:{sessionId}`** — Distributed lock string (`SET NX EX <ttl>`) for state transitions and host end. TTL set by caller (default 30s).
- **`session_lock:evaluation:{sessionId}`** — Separate lock for swipe match evaluation (`acquireEvaluationLock`). TTL set by caller (default 10s).

#### 5.3.2 Counter vs. Set Implementation

Per-media likes are intentionally stored as **sets of userIds**, not simple counters. This enables idempotent `LIKE` tracking, atomic cardinality via `SCARD`, and an `SINTER` check against the participant set to confirm a unanimous match (`isMediaLikedByAllParticipants`).
### 5.4 API Route Contracts & Business Logic Specification (src/app/api/)

All endpoints validate JSON bodies with Zod `safeParse` and return `{ error: string }` on failure. Participant auth is a signed `user_session` httpOnly JWT cookie. The current routes mint/verify the JWT with `jose` rather than the Better Auth / Auth.js (v5) engine listed in §5.1; the cookie remains signed and HTTP-only, so this is documented as a ⚠ Implementation gap pending migration to the specified auth engine.
#### 5.4.1 POST /api/sessions — Session Initialization & Seeding

**Auth Requirement:** Open (creates the host ephemeral guest account).

**Request Payload (Zod Schema):**
```typescript
const createSessionBodySchema = z.object({
  displayName: z.string().min(1).max(50),
  title: z.string().max(100).optional(),
  deadlineAt: z.string().datetime().optional(),
  initialPoolType: z
    .enum(['trending_movies', 'top_tv', 'sci_fi_action', 'custom'])
    .optional()
    .default('trending_movies'),
  mediaType: z.string().optional(),
  genreIds: z.array(z.number().int()).optional(),
  customMedia: z.array(
    z.object({
      tmdbId: z.string().min(1),
      mediaType: z.enum(['movie', 'tv']),
      title: z.string().min(1),
      posterPath: z.string().nullable().optional(),
      releaseYear: z.string().optional(),
      overview: z.string().optional(),
    })
  ).optional(),
});
```

**Execution Flow:**
- Creates an ephemeral guest `users` row (`isGuest: 1`).
- Generates a unique 6-character `joinCode`.
- Inserts the `sessions` row with `status = 'SWIPING_ACTIVE'` and `deadlineAt` (default 24h from now).
- Seeds `session_media` from TMDB presets (`discoverMovies` / `discoverTV`) or from `customMedia` when `initialPoolType === 'custom'`.
- Adds the host to the Redis participant set and the `session_participants` table.
- Sets the `user_session` signed JWT cookie.

**Response Payload (201 Created):**
```typescript
{
  sessionId: string,
  userId: string,
  title: string,
  joinCode: string,       // 6-character room code
  status: 'SWIPING_ACTIVE',
  deadlineAt: string,     // ISO-8601
}
```

#### 5.4.2 POST /api/sessions/join — Join by 6-Character Join Code

**Auth Requirement:** Open.

**Request Payload (Zod Schema):**
```typescript
const joinByCodeSchema = z.object({
  code: z.string().length(6),
  displayName: z.string().min(1).max(50),
});
```

**Execution Flow:**
- Looks up the session by `joinCode` (case-insensitive).
- Rejects if the session is not `SWIPING_ACTIVE`.
- Creates a guest user, adds the participant, mints the session JWT, and sets the cookie.

**Response Payload (200 OK):** Same shape as §5.4.3.

#### 5.4.3 POST /api/sessions/[id]/join — Join by Session ID

**Auth Requirement:** Open.

**Request Payload (Zod Schema):**
```typescript
const joinByIdSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
});
```

**Execution Flow:** Same as §5.4.2, but keyed by `sessionId` from the URL.

**Response Payload (200 OK):**
```typescript
{
  sessionId: string,
  userId: string,
  title: string,
  status: 'SWIPING_ACTIVE',
  deadlineAt: string,
  participantCount: number,
}
```

#### 5.4.4 POST /api/sessions/[id]/swipe — Atomic Swipe & Match Engine

**Auth Requirement:** Valid signed `user_session` JWT for a participant.

**Request Payload (Zod Schema):**
```typescript
const submitSwipeSchema = z.object({
  mediaId: z.string().uuid(),
  vote: z.enum(['LIKE', 'PASS']),
});
```

**Execution Flow:**
- Verifies the media belongs to the session and that the session is `SWIPING_ACTIVE`.
- Inserts the swipe with `ON CONFLICT DO NOTHING` on `(sessionId, userId, mediaId)`. A duplicate returns `{ success: true }`.
- On `LIKE`, adds `userId` to the Redis set `session:{sessionId}:media:{mediaId}:likes`.
- If the like set covers every participant, marks `session_media.isMatched = 1` and adds the media to `session_matches`.
- If the user has voted on every media item, transitions the session: `COMPLETED` for a single match, otherwise `HEAD_TO_HEAD_ACTIVE`.

**Response Payload (200 OK):**
```typescript
{ success: true, matchFound?: boolean }
```

#### 5.4.5 GET /api/sessions/[id] — State & Polling Endpoint

**Auth Requirement:** Valid signed `user_session` JWT for a participant.

**Response Payload (200 OK):**
```typescript
{
  session: {
    id: string,
    title: string,
    joinCode: string | null,
    hostId: string,
    status: 'SWIPING_ACTIVE' | 'HEAD_TO_HEAD_ACTIVE' | 'DEADLINE_RESOLVED' | 'COMPLETED',
    deadlineAt: string,
    finalWinningMediaId: string | null,
  },
  participants: Array<{
    userId: string,
    displayName: string,
    isHost: boolean,
    swipedCount: number,
    totalMediaCount: number,
    isFinished: boolean,
  }>,
  mediaPool: Array<{
    id: string,
    tmdbId: string,
    mediaType: 'movie' | 'tv',
    title: string,
    posterPath: string | null,
    releaseYear: string | null,
    overview: string | null,
    isMatched: boolean,
  }>,
  matches: string[],              // sessionMedia.id values
  participantCount: number,
  userId: string,
  headToHeadVotes: Array<{
    userId: string,
    preferredMediaId: string,
    opponentMediaId: string,
  }>,
  headToHeadStandings: Array<{
    mediaId: string,
    wins: number,
  }>,
  winningMedia: {
    id: string,
    tmdbId: string,
    mediaType: string,
    title: string,
    posterPath: string | null,
    releaseYear: string | null,
    overview: string | null,
    voteAverage: number | null,
    watchUrl: string,
  } | null,
}
```

**Notes:**
- Lazily resolves the session when `deadlineAt` has passed.
- `winningMedia` is populated once the session reaches `COMPLETED` or `DEADLINE_RESOLVED`.

#### 5.4.6 POST /api/sessions/[id]/end — Host Early-End & Top-Pick Resolution

**Auth Requirement:** Host only (same signed `user_session` cookie).

**Request Payload:** None.

**Execution Flow:**
- Verifies the caller is the session host and that the session is `SWIPING_ACTIVE`.
- Acquires the Redis session lock.
- Calls `resolveSessionOutcome` to compute like counts from the `swipes` table.
- If one media has unanimous likes: `COMPLETED` with that winner.
- Otherwise, if one media has the sole top like count: `COMPLETED` with that winner.
- Otherwise, the top 5 liked media are marked `isMatched = 1` and added to `session_matches`; status becomes `HEAD_TO_HEAD_ACTIVE`.
- If there are zero likes, status becomes `DEADLINE_RESOLVED` with no winner.
- Caches the winner metadata in Redis.

**Response Payload (200 OK):**
```typescript
{
  status: 'COMPLETED' | 'HEAD_TO_HEAD_ACTIVE' | 'DEADLINE_RESOLVED',
  winningMedia: /* same WinnerMedia shape as §5.4.5 */ | null,
}
```

#### 5.4.7 POST /api/sessions/[id]/head-to-head — Pairwise Tie-Breaker Vote

**Auth Requirement:** Valid signed `user_session` JWT for a participant.

**Request Payload (Zod Schema):**
```typescript
const headToHeadVoteSchema = z.object({
  preferredMediaId: z.string().uuid(),
  opponentMediaId: z.string().uuid(),
});
```

**Execution Flow:**
- Rejects if `preferredMediaId === opponentMediaId`.
- On the first vote, transitions `SWIPING_ACTIVE` → `HEAD_TO_HEAD_ACTIVE`.
- Resolves the tie-breaker pool from the Redis `session_matches` set, falling back to `session_media.isMatched = 1`.
- If fewer than two matched media remain, completes the session immediately with the sole candidate or `null`.
- Upserts the participant’s vote for the unordered pair.
- Recomputes pairwise win totals with `computeHeadToHeadStandings`.
- When `allVotes.length` reaches `totalPairs * participantCount`, the leader is crowned winner, the session becomes `COMPLETED`, and the winner is cached.

**Response Payload (200 OK):**
```typescript
{
  success: true,
  completed: boolean,
  winner: /* WinnerMedia */ | null,
  standings: Array<{ mediaId: string, wins: number }>,
}
```

#### 5.4.8 GET /api/media/search — TMDB Proxy for Custom Decks

**Auth Requirement:** Open.

**Query Parameters:**
- `query` (string) — required; empty query returns `{ results: [] }`.
- `mediaType` (`'movie' | 'tv' | 'both'`) — default `'movie'`.
- `page` (number) — default `1`.
- `genreIds` (comma-separated TMDB genre ids) — optional filter.

**Execution Flow:**
- Calls `searchMovies` / `searchTV` (or both for `mediaType === 'both'`).
- Filters client-side by `genreIds` when provided.

**Response Payload (200 OK):**
```typescript
{
  results: Array<{
    tmdbId: string,
    mediaType: 'movie' | 'tv',
    title: string,
    posterPath: string | null,
    releaseYear: string,
    overview: string,
    genreIds: number[],
    voteAverage: number,
  }>,
}
```

## Changelog

- **v5.1 — 2026-07-26:** Reconciled §5.2 schema, §5.3 Redis key/structure, and §5.4 API contracts with the current implementation; added `joinCode`, `DEADLINE_RESOLVED`, `session_participants`, and documented `POST /api/sessions/join`, `POST /api/sessions/[id]/end`, and `GET /api/media/search`.
