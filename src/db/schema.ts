import { pgTable, uuid, varchar, timestamp, integer, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

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
}, (table) => [
  index('idx_accounts_user_id').on(table.userId),
]);

// 2. Swiping Sessions
export const sessions = pgTable('sessions', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  hostId: uuid('host_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),  
  title: varchar('title', { length: 100 }).default('Movie Night').notNull(),  
  status: sessionStatusEnum('status').default('SWIPING_ACTIVE').notNull(),  
  finalWinningMediaId: varchar('final_winning_media_id', { length: 50 }),  
  deadlineAt: timestamp('deadline_at').notNull(),  
  createdAt: timestamp('created_at').defaultNow().notNull(),  
}, (table) => [
  index('idx_sessions_host_id').on(table.hostId),
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
