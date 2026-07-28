import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { pingDatabase } from './db/pool.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { requestsRouter } from './modules/requests/requests.routes.js';

/**
 * Builds the Express app without starting a server.
 *
 * Keeping `listen` out of this file is what lets the test suite mount the whole
 * app in-process via Supertest — no ports, no teardown races, no flakiness.
 *
 * Note on async errors: Express 5 forwards a rejected promise from a handler to
 * the error middleware automatically, so the `asyncHandler` wrapper that Express 4
 * needed is gone.
 */
export function createApp(): Express {
  const app = express();

  // Trust the first proxy hop so rate limiting and logs see the real client IP
  // rather than the load balancer's.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );

  // 100kb is far more than any endpoint here needs; the default 1mb is an easy
  // memory-pressure lever for anyone who wants to push on it.
  app.use(express.json({ limit: '100kb' }));

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: { ignore: (req: { url?: string }) => req.url === '/api/v1/health' },
    }),
  );

  /**
   * Health check. Reports the database too, because a process that is up but
   * cannot reach Postgres is not healthy — it just looks healthy to a naive probe.
   */
  app.get('/api/v1/health', async (_req, res) => {
    const database = await pingDatabase();

    res.status(database ? 200 : 503).json({
      status: database ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: database ? 'ok' : 'unreachable' },
    });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/requests', requestsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
