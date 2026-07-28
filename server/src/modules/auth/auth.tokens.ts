import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../../config/env.js';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

type TokenPayload = SessionUser & {
  /** Expiry, epoch milliseconds. */
  exp: number;
};

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours — one working day.

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(body: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(body).digest('base64url');
}

/**
 * Deliberately *not* a real JWT.
 *
 * The brief said a mocked login is fine, so there is no user table and no password
 * hashing. What is real is the boundary: the token carries an expiry and an HMAC
 * signature over its payload, and every protected route verifies both. A client
 * cannot forge a session by editing localStorage, which is the property that makes
 * the rest of the API meaningful to test.
 *
 * Swapping this for real JWTs plus a users table touches only this file and the
 * login controller — nothing downstream knows the difference.
 */
export function issueToken(user: SessionUser): { token: string; expiresAt: string } {
  const payload: TokenPayload = { ...user, exp: Date.now() + TOKEN_TTL_MS };
  const body = base64url(JSON.stringify(payload));
  return {
    token: `${body}.${sign(body)}`,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

export function verifyToken(token: string): SessionUser | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Constant-time compare so the check can't be probed byte by byte.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;

  return { id: payload.id, email: payload.email, name: payload.name };
}
