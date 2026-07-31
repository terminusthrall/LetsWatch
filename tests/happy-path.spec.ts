import { test, expect } from '@playwright/test';
import { redis, clearAllTestKeys } from '../src/modules/redis';

test.describe.configure({ mode: 'serial' });

test.describe('Happy path', () => {
  test.afterAll(async () => {
    await clearAllTestKeys();
  });

  test('creates a session and prefixes Redis keys with test:', async ({ page }) => {
    await page.goto('/');

    await page.fill('#displayName', 'Test Host');
    await page.fill('#title', 'E2E Test Session');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/session\/.+/);

    const sessionId = new URL(page.url()).pathname.split('/session/')[1];
    expect(sessionId).toBeTruthy();

    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(cursor, {
        match: `test:*${sessionId}*`,
        count: 100,
      });
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^test:/);
    }
  });
});
