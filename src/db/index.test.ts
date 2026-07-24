import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const neon = vi.fn(() => 'sql-client');
const drizzle = vi.fn(() => 'drizzle-client');

vi.mock('@neondatabase/serverless', () => ({ neon }));
vi.mock('drizzle-orm/neon-http', () => ({ drizzle }));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/letswatch';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('db', () => {
  it('creates a drizzle client bound to the neon connection and schema', async () => {
    vi.resetModules();
    const schema = await import('./schema');

    const { db } = await import('./index');

    expect(neon).toHaveBeenCalledWith('postgres://user:pass@localhost:5432/letswatch');
    expect(drizzle).toHaveBeenCalledWith('sql-client', { schema });
    expect(db).toBe('drizzle-client');
  });

  it('throws when DATABASE_URL is not set', async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();

    await expect(import('./index')).rejects.toThrow(
      'DATABASE_URL environment variable is not set',
    );
  });
});
