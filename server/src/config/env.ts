import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/**
 * Environment contract.
 *
 * Config is validated once, at boot, before anything else starts. A malformed
 * environment should crash the process immediately with a readable message —
 * not surface later as a confusing runtime error on the first request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AUTH_SECRET: z.string().min(8, 'AUTH_SECRET must be at least 8 characters'),
  DEMO_USER_EMAIL: z.string().email().default('ops@example.com'),
  DEMO_USER_PASSWORD: z.string().min(6).default('demo1234'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  console.error(
    `\nInvalid environment configuration:\n\n${issues}\n\n` +
      `Copy server/.env.example to server/.env and fill in the missing values.\n`,
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  /** CORS_ORIGIN is authored as a comma-separated list; consumers want an array. */
  corsOrigins: parsed.data.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
} as const;

export type Env = typeof env;
