import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { ApiError } from '../lib/ApiError.js';
import { logger } from '../lib/logger.js';

/** Every error response on this API has exactly this shape. */
export type ErrorResponseBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
};

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
}

/**
 * The single place an error becomes an HTTP response.
 *
 * Three classes of error arrive here:
 *   • ApiError      — thrown on purpose, carries its own status and code
 *   • ZodError      — a validation failure that escaped a route's own handling
 *   • anything else — a bug; logged with its stack, returned as an opaque 500
 *
 * The last case is the important one. Internal messages never reach the client,
 * so a stack trace or a Postgres error string can't leak through an unhandled path.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    // 4xx is the client's problem and expected traffic — log it at debug, not error.
    logger.debug(
      { requestId: String(req.id), code: error.code, status: error.status },
      'Request rejected',
    );

    const body: ErrorResponseBody = {
      error: { code: error.code, message: error.message, details: error.details },
      requestId: String(req.id),
    };
    res.status(error.status).json(body);
    return;
  }

  if (error instanceof ZodError) {
    const body: ErrorResponseBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request body or query string is not valid.',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      requestId: String(req.id),
    };
    res.status(400).json(body);
    return;
  }

  logger.error({ err: error, requestId: req.id }, 'Unhandled error');

  const body: ErrorResponseBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our end. Quote the request id if you report this.',
    },
    requestId: String(req.id),
  };
  res.status(500).json(body);
}
