import pino from 'pino';

import { env } from '../config/env.js';

/**
 * One logger for the whole process.
 *
 * JSON in production so a log aggregator can parse it; pretty-printed in
 * development so a human can read it. Tests stay silent.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.isProduction ? 'info' : 'debug',
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
