import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Load .env first so the test database can be derived from the real DATABASE_URL
// (same host and credentials, different database name).
loadDotenv();

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/client_requests')
    .replace(/\/([^/?]+)(\?|$)/, '/$1_test$2');

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // The suite shares one database, so files must not run concurrently.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      AUTH_SECRET: 'test-secret-not-used-anywhere-else',
    },
  },
});
