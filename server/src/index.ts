import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool, pingDatabase } from './db/pool.js';
import { closeAllStreams } from './lib/eventBus.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  // Fail loudly at boot rather than on the first request that needs the database.
  if (!(await pingDatabase())) {
    logger.error(
      'Cannot reach the database. Check DATABASE_URL and that Postgres is running, ' +
        'then run `npm run db:migrate`.',
    );
    process.exit(1);
  }

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  /**
   * Graceful shutdown.
   *
   * On SIGTERM the orchestrator has already stopped routing new traffic to this
   * process. Stop accepting connections, let in-flight requests finish, close the
   * pool, then exit — so nobody gets a truncated response and no Postgres
   * connection is left dangling. The timer is the backstop: if something hangs,
   * exit anyway rather than block a deploy forever.
   */
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutting down');

    // Every SSE stream is an open connection, and `server.close()` waits for all of
    // them. Without this the process hangs until the force-exit timer fires.
    closeAllStreams();

    const force = setTimeout(() => {
      logger.error('Shutdown timed out after 10s — forcing exit');
      process.exit(1);
    }, 10_000);
    force.unref();

    server.close(async () => {
      await closePool().catch((error) => logger.error({ err: error }, 'Failed to close pool'));
      logger.info('Shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error({ err: error }, 'Failed to start');
  process.exit(1);
});
