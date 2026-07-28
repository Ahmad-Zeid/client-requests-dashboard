import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '../../config/env.js';
import { ApiError } from '../../lib/ApiError.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import * as controller from './auth.controller.js';

/**
 * Login is the one unauthenticated write on the API, which makes it the one
 * endpoint worth brute-forcing. Twenty attempts per fifteen minutes per IP is
 * generous for a human and useless for a script. Disabled under test so the suite
 * doesn't trip over its own repeated logins.
 */
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: () => {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again in a few minutes.');
  },
});

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, controller.login);
authRouter.get('/me', requireAuth, controller.me);
