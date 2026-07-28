import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// `Express.Request.id` is declared by pino-http (as `ReqId`), so there is no
// augmentation to add here — this middleware just populates it before the logger runs.

/**
 * Tags every request with an id, echoes it back in a header, and makes it
 * available to the logger and the error handler.
 *
 * This is the thread that lets you take an error a user reports and find the
 * exact log lines for that one request. Honours an inbound `x-request-id` so the
 * id survives across a proxy or a calling service.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  req.id = inbound && inbound.length <= 200 ? inbound : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
