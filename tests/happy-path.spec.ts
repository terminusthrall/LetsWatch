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

    const url = page.url();
    const sessionId = url.split('/session/')[1];

    const [, keys] = await redis.scan('0', {
      match: `test:session*:${sessionId}*`,
      count: 100,
    });

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^test:/);
    }
  });
});
