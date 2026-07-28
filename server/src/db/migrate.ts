import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from '../lib/logger.js';
import { closePool, pool } from './pool.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * A deliberately small migration runner.
 *
 * Applied filenames are recorded in `schema_migrations`, so running this twice is
 * a no-op and a fresh database catches up in order. Each migration runs inside a
 * transaction alongside its bookkeeping row: either the DDL and the record both
 * land, or neither does. That is the property that makes re-running safe.
 */
export async function migrate(): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ name: string }>('select name from schema_migrations');
  const applied = new Set(rows.map((row) => row.name));

  const pending = files.filter((file) => !applied.has(file));

  if (pending.length === 0) {
    logger.info('No pending migrations — schema is up to date.');
    return;
  }

  for (const file of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      logger.info({ migration: file }, 'Applied migration');
    } catch (error) {
      await client.query('rollback');
      logger.error({ err: error, migration: file }, 'Migration failed — rolled back');
      throw error;
    } finally {
      client.release();
    }
  }
}

// Only run when invoked directly (`npm run db:migrate`), not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (error) => {
      logger.error({ err: error }, 'Migration run failed');
      await closePool().catch(() => {});
      process.exit(1);
    });
}
