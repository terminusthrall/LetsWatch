import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const redisMock = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  smembers: vi.fn(),
  expire: vi.fn(),
};

const constructorSpy = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(config: { url: string; token: string }) {
      constructorSpy(config);
      return redisMock;
    }
  },
}));

type RedisModule = typeof import('./index');

async function importModule(): Promise<RedisModule> {
  vi.resetModules();
  return import('./index');
}

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('module initialisation', () => {
  it('constructs the client with the configured credentials', async () => {
    const { redis } = await importModule();

    expect(constructorSpy).toHaveBeenCalledWith({
      url: 'https://redis.example.com',
      token: 'test-token',
    });
    expect(redis).toBe(redisMock);
  });

  it.each(['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'])(
    'throws when %s is missing',
    async (variable) => {
      delete process.env[variable];

      await expect(importModule()).rejects.toThrow(
        'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required',
      );
    },
  );
});

describe('acquireSessionLock', () => {
  it('sets the lock key with NX and the default TTL', async () => {
    redisMock.set.mockResolvedValue('OK');
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const { acquireSessionLock } = await importModule();

    await expect(acquireSessionLock('abc')).resolves.toBe(true);
    expect(redisMock.set).toHaveBeenCalledWith('session_lock:abc', String(now), {
      nx: true,
      ex: 30,
    });
  });

  it('honours a custom TTL', async () => {
    redisMock.set.mockResolvedValue('OK');
    const { acquireSessionLock } = await importModule();

    await acquireSessionLock('abc', 5);

    expect(redisMock.set).toHaveBeenCalledWith(
      'session_lock:abc',
      expect.any(String),
      { nx: true, ex: 5 },
    );
  });

  it('returns false when the lock is already held', async () => {
    redisMock.set.mockResolvedValue(null);
    const { acquireSessionLock } = await importModule();

    await expect(acquireSessionLock('abc')).resolves.toBe(false);
  });
});

describe('releaseSessionLock', () => {
  it('deletes the lock key', async () => {
    const { releaseSessionLock } = await importModule();

    await releaseSessionLock('abc');

    expect(redisMock.del).toHaveBeenCalledWith('session_lock:abc');
  });
});

describe('session state', () => {
  it('reads the state key', async () => {
    redisMock.get.mockResolvedValue({ status: 'SWIPING_ACTIVE' });
    const { getSessionState } = await importModule();

    await expect(getSessionState('abc')).resolves.toEqual({ status: 'SWIPING_ACTIVE' });
    expect(redisMock.get).toHaveBeenCalledWith('session:abc');
  });

  it('serialises the state and applies the default TTL', async () => {
    const { setSessionState } = await importModule();
    const state = { status: 'COMPLETED', round: 2 };

    await setSessionState('abc', state);

    expect(redisMock.set).toHaveBeenCalledWith('session:abc', JSON.stringify(state), {
      ex: 3600,
    });
  });

  it('honours a custom TTL', async () => {
    const { setSessionState } = await importModule();

    await setSessionState('abc', { status: 'COMPLETED' }, 60);

    expect(redisMock.set).toHaveBeenCalledWith('session:abc', expect.any(String), {
      ex: 60,
    });
  });
});

describe('participants', () => {
  it('adds a participant and refreshes the TTL', async () => {
    const { addSessionParticipant } = await importModule();

    await addSessionParticipant('abc', 'user-1');

    expect(redisMock.sadd).toHaveBeenCalledWith('session_participants:abc', 'user-1');
    expect(redisMock.expire).toHaveBeenCalledWith('session_participants:abc', 3600);
  });

  it('honours a custom TTL when adding a participant', async () => {
    const { addSessionParticipant } = await importModule();

    await addSessionParticipant('abc', 'user-1', 120);

    expect(redisMock.expire).toHaveBeenCalledWith('session_participants:abc', 120);
  });

  it('lists participants', async () => {
    redisMock.smembers.mockResolvedValue(['user-1', 'user-2']);
    const { getSessionParticipants } = await importModule();

    await expect(getSessionParticipants('abc')).resolves.toEqual(['user-1', 'user-2']);
    expect(redisMock.smembers).toHaveBeenCalledWith('session_participants:abc');
  });

  it('removes a participant', async () => {
    const { removeSessionParticipant } = await importModule();

    await removeSessionParticipant('abc', 'user-1');

    expect(redisMock.srem).toHaveBeenCalledWith('session_participants:abc', 'user-1');
  });
});

describe('matches', () => {
  it('adds a match and refreshes the TTL', async () => {
    const { addSessionMatch } = await importModule();

    await addSessionMatch('abc', 'media-1');

    expect(redisMock.sadd).toHaveBeenCalledWith('session_matches:abc', 'media-1');
    expect(redisMock.expire).toHaveBeenCalledWith('session_matches:abc', 3600);
  });

  it('honours a custom TTL when adding a match', async () => {
    const { addSessionMatch } = await importModule();

    await addSessionMatch('abc', 'media-1', 90);

    expect(redisMock.expire).toHaveBeenCalledWith('session_matches:abc', 90);
  });

  it('lists matches', async () => {
    redisMock.smembers.mockResolvedValue(['media-1']);
    const { getSessionMatches } = await importModule();

    await expect(getSessionMatches('abc')).resolves.toEqual(['media-1']);
    expect(redisMock.smembers).toHaveBeenCalledWith('session_matches:abc');
  });
});

describe('clearSessionData', () => {
  it('deletes every key namespace for the session in one call', async () => {
    const { clearSessionData } = await importModule();

    await clearSessionData('abc');

    expect(redisMock.del).toHaveBeenCalledTimes(1);
    expect(redisMock.del).toHaveBeenCalledWith(
      'session:abc',
      'session_lock:abc',
      'session_participants:abc',
      'session_matches:abc',
    );
  });
});
