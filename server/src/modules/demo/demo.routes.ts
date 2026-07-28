import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '../../config/env.js';
import { seed } from '../../db/seed.js';
import { ApiError } from '../../lib/ApiError.js';
import { logger } from '../../lib/logger.js';
import { requireAuth } from '../../middleware/requireAuth.js';

/**
 * Only mounted when DEMO_MODE is on.
 *
 * The public demo shares one database with everyone who opens the link, so the first
 * visitor to mark every request Done leaves the next person looking at an empty
 * queue. This puts the data back.
 *
 * It is genuinely destructive, so it does not exist unless a deployment opts in —
 * the route is never registered in a normal environment rather than being registered
 * and then refusing, because an endpoint that returns 403 still tells an attacker it
 * is there.
 */
const resetRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: () => {
    throw new ApiError(429, 'RATE_LIMITED', 'The demo data was just reset. Try again shortly.');
  },
});

export const demoRouter = Router();

demoRouter.post('/reset', requireAuth, resetRateLimit, async (req, res) => {
  await seed();
  logger.warn({ by: req.user?.email }, 'Demo data reset');
  res.json({ data: { reset: true } });
});

export function isDemoMode(): boolean {
  return env.DEMO_MODE;
}
