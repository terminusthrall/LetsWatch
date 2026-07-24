# [v5.0] PRD & Technical Design Document: Movie & Show Group Decision Platform

**Project Name:** Movie & Show Group Decision & Recommendation Platform

**Document Version:** v5.0 (Master Revision - Continuous Pool Evaluation, Head-to-Head Ranked Consensus, Progressive Accounts & Pricing)

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
import { pgTable, uuid, varchar, timestamp, integer, pgEnum, primaryKey, index } from 'drizzle-orm/pg-core';  

export const voteEnum = pgEnum('vote_direction', ['LIKE', 'PASS']);  
export const sessionStatusEnum = pgEnum('session_status', ['SWIPING_ACTIVE', 'HEAD_TO_HEAD_ACTIVE', 'COMPLETED']);  

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
});

// 2. Swiping Sessions
export const sessions = pgTable('sessions', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  hostId: uuid('host_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),  
  title: varchar('title', { length: 100 }).default('Movie Night').notNull(),  
  status: sessionStatusEnum('status').default('SWIPING_ACTIVE').notNull(),  
  finalWinningMediaId: varchar('final_winning_media_id', { length: 50 }),  
  deadlineAt: timestamp('deadline_at').notNull(),  
  createdAt: timestamp('created_at').defaultNow().notNull(),  
});  

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
});  

// 4. Swipes & Head-to-Head Votes
export const swipes = pgTable('swipes', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),  
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),  
  mediaId: uuid('media_id').references(() => sessionMedia.id, { onDelete: 'cascade' }).notNull(),  
  vote: voteEnum('vote').notNull(),  
  createdAt: timestamp('created_at').defaultNow().notNull(),  
});  

export const headToHeadVotes = pgTable('head_to_head_votes', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),  
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),  
  preferredMediaId: uuid('preferred_media_id').references(() => sessionMedia.id, { onDelete: 'cascade' }).notNull(),  
  opponentMediaId: uuid('opponent_media_id').references(() => sessionMedia.id, { onDelete: 'cascade' }).notNull(),  
  createdAt: timestamp('created_at').defaultNow().notNull(),  
});
```
