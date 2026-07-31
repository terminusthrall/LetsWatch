import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Make local env vars available to tests that import server modules.
dotenv.config({ path: '.env.local' });

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['tests/**', 'node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
