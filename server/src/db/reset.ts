import { fileURLToPath } from 'node:url';

import { logger } from '../lib/logger.js';
import { migrate } from './migrate.js';
import { closePool, pool } from './pool.js';
import { seed } from './seed.js';

/**
 * Drop everything, re-migrate, re-seed. Development and test convenience only —
 * there is deliberately no guard rail here, so it is never wired into a deploy script.
 */
export async function reset(): Promise<void> {
  await pool.query('drop table if exists client_requests');
  await pool.query('drop table if exists schema_migrations');
  await pool.query('drop type if exists request_status');
  logger.info('Dropped existing schema');

  await migrate();
  await seed();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  reset()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (error) => {
      logger.error({ err: error }, 'Reset failed');
      await closePool().catch(() => {});
      process.exit(1);
    });
}
