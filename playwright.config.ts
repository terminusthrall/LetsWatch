import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// E2E tests run against the local dev server with test-scoped Redis keys.
dotenv.config({ path: '.env.local' });
process.env.NODE_ENV = 'test';
process.env.REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? 'test:';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'test',
      REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
    },
  },
});
