import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  insertSessionSchema,
  insertSwipeSchema,
  insertUserSchema,
  selectSessionSchema,
  selectSwipeSchema,
  selectUserSchema,
  sessionMedia,
  sessionStatusEnum,
  sessions,
  swipes,
  users,
  voteEnum,
} from './schema';

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('enums', () => {
  it('exposes the vote directions', () => {
    expect(voteEnum.enumValues).toEqual(['LIKE', 'PASS']);
  });

  it('exposes the session lifecycle states', () => {
    expect(sessionStatusEnum.enumValues).toEqual([
      'SWIPING_ACTIVE',
      'HEAD_TO_HEAD_ACTIVE',
      'COMPLETED',
    ]);
  });
});

describe('insertUserSchema', () => {
  it('accepts a minimal guest and leaves defaults to the database', () => {
    const parsed = insertUserSchema.parse({ displayName: 'Ada' });

    expect(parsed).toEqual({ displayName: 'Ada' });
  });

  it('rejects a missing display name', () => {
    expect(() => insertUserSchema.parse({})).toThrow();
  });

  it('rejects a display name longer than the column length', () => {
    expect(() => insertUserSchema.parse({ displayName: 'a'.repeat(51) })).toThrow();
  });

  it('rejects an email longer than the column length', () => {
    expect(() =>
      insertUserSchema.parse({ displayName: 'Ada', email: `${'a'.repeat(256)}` }),
    ).toThrow();
  });
});

describe('selectUserSchema', () => {
  it('requires every non-nullable column', () => {
    const row = {
      id: uuid(1),
      displayName: 'Ada',
      email: null,
      isGuest: 1,
      isProSubscriber: 0,
      createdAt: new Date(),
    };

    expect(selectUserSchema.parse(row)).toEqual(row);
    expect(() => selectUserSchema.parse({ ...row, isGuest: undefined })).toThrow();
  });
});

describe('insertSessionSchema', () => {
  it('requires a host and a deadline', () => {
    const parsed = insertSessionSchema.parse({
      hostId: uuid(1),
      deadlineAt: new Date('2030-01-01T00:00:00Z'),
    });

    expect(parsed.hostId).toBe(uuid(1));
    expect(() => insertSessionSchema.parse({ hostId: uuid(1) })).toThrow();
  });

  it('rejects an invalid status', () => {
    expect(() =>
      insertSessionSchema.parse({
        hostId: uuid(1),
        deadlineAt: new Date(),
        status: 'PAUSED',
      }),
    ).toThrow();
  });
});

describe('selectSessionSchema', () => {
  it('parses a complete session row', () => {
    const row = {
      id: uuid(2),
      hostId: uuid(1),
      title: 'Movie Night',
      status: 'HEAD_TO_HEAD_ACTIVE' as const,
      finalWinningMediaId: null,
      deadlineAt: new Date(),
      createdAt: new Date(),
    };

    expect(selectSessionSchema.parse(row)).toEqual(row);
  });
});

describe('swipe schemas', () => {
  it('requires a valid vote direction', () => {
    const swipe = {
      sessionId: uuid(2),
      userId: uuid(1),
      mediaId: uuid(3),
      vote: 'LIKE' as const,
    };

    expect(insertSwipeSchema.parse(swipe).vote).toBe('LIKE');
    expect(() => insertSwipeSchema.parse({ ...swipe, vote: 'MAYBE' })).toThrow();
  });

  it('rejects non-uuid identifiers', () => {
    expect(() =>
      insertSwipeSchema.parse({
        sessionId: 'not-a-uuid',
        userId: uuid(1),
        mediaId: uuid(3),
        vote: 'PASS',
      }),
    ).toThrow();
  });

  it('parses a persisted swipe row', () => {
    const row = {
      id: uuid(4),
      sessionId: uuid(2),
      userId: uuid(1),
      mediaId: uuid(3),
      vote: 'PASS' as const,
      createdAt: new Date(),
    };

    expect(selectSwipeSchema.parse(row)).toEqual(row);
  });
});

describe('table definitions', () => {
  it('names the tables as specified', () => {
    expect(getTableConfig(users).name).toBe('users');
    expect(getTableConfig(sessions).name).toBe('sessions');
    expect(getTableConfig(sessionMedia).name).toBe('session_media');
    expect(getTableConfig(swipes).name).toBe('swipes');
  });

  it('enforces one swipe per user per media item', () => {
    const unique = getTableConfig(swipes)
      .indexes.filter((i) => i.config.unique)
      .map((i) => i.config.name);

    expect(unique).toContain('uniq_user_swipe');
  });

  it('enforces one entry per tmdb title within a session', () => {
    const unique = getTableConfig(sessionMedia)
      .indexes.filter((i) => i.config.unique)
      .map((i) => i.config.name);

    expect(unique).toContain('uniq_session_tmdb');
  });

  it('indexes the hot lookup paths', () => {
    expect(getTableConfig(sessions).indexes.map((i) => i.config.name)).toContain(
      'idx_sessions_host_id',
    );
    expect(getTableConfig(swipes).indexes.map((i) => i.config.name)).toContain(
      'idx_swipes_session_user',
    );
    expect(getTableConfig(sessionMedia).indexes.map((i) => i.config.name)).toContain(
      'idx_session_media_session_id',
    );
  });
});
