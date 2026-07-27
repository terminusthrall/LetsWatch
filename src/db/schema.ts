import { pgTable, uuid, varchar, timestamp, boolean, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const voteEnum = pgEnum('vote_direction', ['LIKE', 'PASS']);  
export const sessionStatusEnum = pgEnum('session_status', ['SWIPING_ACTIVE', 'HEAD_TO_HEAD_ACTIVE', 'DEADLINE_RESOLVED', 'COMPLETED']);  

// 1. Users & Accounts Schema (Ephemeral Guests & Pro Subscribers)
export const users = pgTable('users', {  
  id: uuid('id').primaryKey().defaultRandom(),  
  displayName: varchar('display_name', { length: 50 }).notNull(),  
  email: varchar('email', { length: 255 }),
  isGuest: boolean('is_guest').default(true).notNull(), // true = Ephemeral Guest, false = Registered Account
  isProSubscriber: boolean('is_pro_subscriber').default(false).notNull(), // true = Paid Ad-Free / Pro Host
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
  isMatched: boolean('is_matched').default(false).notNull(), // true when a unanimous match occurs  
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
