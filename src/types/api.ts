import { z } from 'zod';

// Shared enums
export const sessionStatusSchema = z.enum([
  'SWIPING_ACTIVE',
  'HEAD_TO_HEAD_ACTIVE',
  'DEADLINE_RESOLVED',
  'COMPLETED',
]);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;

// Request body schemas
export const createSessionBodySchema = z.object({
  displayName: z.string().min(1).max(50),
  title: z.string().max(100).optional(),
  deadlineAt: z.string().datetime().optional(),
  initialPoolType: z
    .enum(['trending_movies', 'top_tv', 'sci_fi_action', 'custom'])
    .optional()
    .default('trending_movies'),
  mediaType: z.string().optional(),
  genreIds: z.array(z.number().int()).optional(),
  customMedia: z
    .array(
      z.object({
        tmdbId: z.string().min(1),
        mediaType: z.enum(['movie', 'tv']),
        title: z.string().min(1),
        posterPath: z.string().nullable().optional(),
        releaseYear: z.string().optional(),
        overview: z.string().optional(),
      })
    )
    .optional(),
});

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;

export const joinByCodeBodySchema = z.object({
  code: z.string().length(6),
  displayName: z.string().min(1).max(50),
});

export type JoinByCodeBody = z.infer<typeof joinByCodeBodySchema>;

export const joinByIdBodySchema = z.object({
  displayName: z.string().trim().min(1).max(50),
});

export type JoinByIdBody = z.infer<typeof joinByIdBodySchema>;

export const submitSwipeBodySchema = z.object({
  mediaId: z.string().uuid(),
  vote: z.enum(['LIKE', 'PASS']),
});

export type SubmitSwipeBody = z.infer<typeof submitSwipeBodySchema>;

export const headToHeadVoteBodySchema = z.object({
  preferredMediaId: z.string().uuid(),
  opponentMediaId: z.string().uuid(),
});

export type HeadToHeadVoteBody = z.infer<typeof headToHeadVoteBodySchema>;

// Response types
export const createSessionResponseSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  title: z.string(),
  joinCode: z.string(),
  status: z.literal('SWIPING_ACTIVE'),
  deadlineAt: z.string(),
});

export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

export const joinSessionResponseSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  title: z.string(),
  status: sessionStatusSchema,
  deadlineAt: z.string(),
  participantCount: z.number(),
});

export type JoinSessionResponse = z.infer<typeof joinSessionResponseSchema>;

export const swipeResponseSchema = z.object({
  success: z.boolean(),
  matchFound: z.boolean().optional(),
});

export type SwipeResponse = z.infer<typeof swipeResponseSchema>;

export const winnerMediaSchema = z.object({
  id: z.string(),
  tmdbId: z.string(),
  mediaType: z.string(),
  title: z.string(),
  posterPath: z.string().nullable(),
  releaseYear: z.string().nullable(),
  overview: z.string().nullable(),
  voteAverage: z.number().nullable(),
  watchUrl: z.string(),
});

export type WinnerMedia = z.infer<typeof winnerMediaSchema>;

export const participantSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  isHost: z.boolean(),
  swipedCount: z.number(),
  totalMediaCount: z.number(),
  isFinished: z.boolean(),
});

export type Participant = z.infer<typeof participantSchema>;

export const sessionMediaSchema = z.object({
  id: z.string(),
  tmdbId: z.string(),
  mediaType: z.string(),
  title: z.string(),
  posterPath: z.string().nullable(),
  releaseYear: z.string().nullable(),
  overview: z.string().nullable(),
  isMatched: z.boolean(),
});

export type SessionMedia = z.infer<typeof sessionMediaSchema>;

export const headToHeadStandingSchema = z.object({
  mediaId: z.string(),
  wins: z.number(),
  title: z.string().optional(),
});

export type HeadToHeadStanding = z.infer<typeof headToHeadStandingSchema>;

export const headToHeadResponseSchema = z.object({
  success: z.boolean(),
  completed: z.boolean(),
  winner: winnerMediaSchema.nullable().optional(),
  standings: z.array(headToHeadStandingSchema),
});

export type HeadToHeadResponse = z.infer<typeof headToHeadResponseSchema>;

export const sessionStateResponseSchema = z.object({
  session: z.object({
    id: z.string(),
    title: z.string(),
    joinCode: z.string().nullable(),
    hostId: z.string(),
    status: sessionStatusSchema,
    deadlineAt: z.string(),
    finalWinningMediaId: z.string().nullable(),
  }),
  participants: z.array(participantSchema),
  matches: z.array(z.string()),
  participantCount: z.number(),
  userId: z.string(),
  headToHeadVotes: z.array(
    z.object({
      userId: z.string(),
      preferredMediaId: z.string(),
      opponentMediaId: z.string(),
    })
  ),
  headToHeadStandings: z.array(headToHeadStandingSchema),
  winningMedia: winnerMediaSchema.nullable(),
});

export type SessionStateResponse = z.infer<typeof sessionStateResponseSchema>;

export const sessionMediaResponseSchema = z.object({
  mediaPool: z.array(sessionMediaSchema),
});

export type SessionMediaResponse = z.infer<typeof sessionMediaResponseSchema>;

export const sessionDetailResponseSchema = sessionStateResponseSchema.extend({
  mediaPool: z.array(sessionMediaSchema),
});

export type SessionDetailResponse = z.infer<typeof sessionDetailResponseSchema>;

export const endSessionResponseSchema = z.object({
  status: sessionStatusSchema,
  winningMedia: winnerMediaSchema.nullable(),
});

export type EndSessionResponse = z.infer<typeof endSessionResponseSchema>;

export const mediaSearchResultSchema = z.object({
  tmdbId: z.string(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string(),
  posterPath: z.string().nullable(),
  releaseYear: z.string(),
  overview: z.string(),
  genreIds: z.array(z.number()),
  voteAverage: z.number(),
});

export type MediaSearchResult = z.infer<typeof mediaSearchResultSchema>;

export const mediaSearchResponseSchema = z.object({
  results: z.array(mediaSearchResultSchema),
});

export type MediaSearchResponse = z.infer<typeof mediaSearchResponseSchema>;
