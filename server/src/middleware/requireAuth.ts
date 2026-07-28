import type { NextFunction, Request, Response } from 'express';

import { ApiError } from '../lib/ApiError.js';
import { verifyToken, type SessionUser } from '../modules/auth/auth.tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/**
 * Guards every route that touches client data.
 *
 * The credential check at login is mocked; this boundary is not. An unauthenticated
 * caller gets a 401 and never reaches a controller.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing bearer token.');
  }

  const user = verifyToken(header.slice('Bearer '.length).trim());

  if (!user) {
    throw ApiError.unauthorized('Session token is invalid or has expired.');
  }

  req.user = user;
  next();
}
