import pg from 'pg';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * `timestamptz` columns arrive as JS Date objects by default, which then get
 * serialised inconsistently depending on where JSON.stringify runs. Parsing them
 * as raw ISO-8601 strings keeps one representation from Postgres all the way to
 * the browser — the API contract says "ISO string", so that is what the driver hands back.
 */
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value: string) => value);

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
