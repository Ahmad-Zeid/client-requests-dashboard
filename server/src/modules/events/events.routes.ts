import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { ApiError } from '../../lib/ApiError.js';
import { subscribe } from '../../lib/eventBus.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { issueTicket, redeemTicket } from './events.tickets.js';

export const eventsRouter = Router();

/** Exchange the bearer token for a short-lived, single-use stream ticket. */
eventsRouter.post('/ticket', requireAuth, (req, res) => {
  res.json({ data: issueTicket(req.user!) });
});

const streamQuerySchema = z.object({
  ticket: z.string().min(1, 'A stream ticket is required.'),
});

/**
 * The live stream.
 *
 * Authenticated by ticket rather than by header, because `EventSource` cannot send
 * one — see events.tickets.ts for why that is not just the session token in a URL.
 */
eventsRouter.get('/', (req, res) => {
  const { ticket } = streamQuerySchema.parse(req.query);
  const user = redeemTicket(ticket);

  if (!user) {
    throw ApiError.unauthorized('Stream ticket is invalid, already used, or expired.');
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Tells nginx not to buffer the response. Without it, a reverse proxy holds
    // every event until the buffer fills and the stream appears dead.
    'x-accel-buffering': 'no',
  });

  // Flushes headers immediately so the browser fires `onopen` rather than waiting
  // for the first event.
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ user: user.email })}\n\n`);

  const unsubscribe = subscribe({ id: randomUUID(), res });

  /**
   * A comment frame every 25 seconds. Idle connections get culled at 30–60s by most
   * proxies and load balancers; this keeps the stream alive without sending an event
   * the client has to reason about.
   */
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});
