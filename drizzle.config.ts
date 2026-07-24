import { defineConfig } from 'drizzle-kit';
import { requireEnv } from './src/lib/env';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: requireEnv('DATABASE_URL'),
  },
});
