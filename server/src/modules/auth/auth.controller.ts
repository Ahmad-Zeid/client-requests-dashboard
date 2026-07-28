import type { Request, Response } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { ApiError } from '../../lib/ApiError.js';
import { issueToken, type SessionUser } from './auth.tokens.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

/**
 * The one demo account, from config rather than a database.
 *
 * The brief allowed a mocked login. What that means here: no users table and no
 * password hashing — but the token this returns is signed and expiring, and every
 * protected route verifies it. Replacing this with a real lookup means changing
 * this function and nothing else.
 */
const DEMO_USER: SessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: env.DEMO_USER_EMAIL,
  name: 'Operations',
};

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);

  const matches = email === env.DEMO_USER_EMAIL.toLowerCase() && password === env.DEMO_USER_PASSWORD;

  if (!matches) {
    // One message for both a wrong email and a wrong password — telling the caller
    // which half was correct is how you hand an attacker a list of valid accounts.
    throw ApiError.invalidCredentials();
  }

  const { token, expiresAt } = issueToken(DEMO_USER);

  res.json({ data: { token, expiresAt, user: DEMO_USER } });
}

export async function me(req: Request, res: Response): Promise<void> {
  res.json({ data: { user: req.user } });
}
