import pg from 'pg';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * `timestamptz` columns arrive as JS Date objects by default, which then get
 * serialised inconsistently depending on where JSON.stringify runs. The API contract
 * says "ISO 8601 string", so the driver is what makes that true — once, here, rather
 * than in every function that happens to touch a timestamp.
 *
 * Handing the raw column value through would be cheaper but wrong. Postgres writes
 * `2026-07-23 21:19:37.119764+03` — a space instead of `T`, and a two-digit offset
 * with no minutes. That is not a format `Date` is required to parse: V8 accepts it,
 * which is why it looks fine in Chrome and in Node, and Safari returns `Invalid Date`.
 * A bug that only appears on one engine, in a field nobody thinks of as parsed, is
 * exactly the kind that survives to production.
 *
 * `toISOString()` normalises to UTC with a `Z` suffix, which every engine parses. The
 * cost is microsecond precision, truncated to milliseconds — timestamps here are read
 * by people, not used for ordering, and `id` is the tiebreaker where ordering matters.
 */
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value: string) =>
  new Date(value).toISOString(),
);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  // Small pool: this is one API process, and Postgres connections are not free.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  // An idle client failing is not tied to any one request, so it has no other
  // path to the logs. Without this handler Node treats it as an uncaught exception.
  logger.error({ err: error }, 'Unexpected error on idle Postgres client');
});

/** Used by the health check — a real round trip, not just "is the pool object alive". */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database ping failed');
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
