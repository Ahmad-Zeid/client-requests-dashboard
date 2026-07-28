import type { Response } from 'express';

import type { ClientRequest } from '../modules/requests/requests.schema.js';
import { logger } from './logger.js';

export type DomainEvent =
  | { type: 'request.created'; data: ClientRequest }
  | { type: 'request.updated'; data: ClientRequest };

type Subscriber = {
  id: string;
  res: Response;
};

/**
 * In-process pub/sub for the SSE stream.
 *
 * Deliberately in-memory: with one API process, a Set of open responses is the whole
 * implementation. The moment this runs on more than one instance it stops working —
 * a write on instance A would never reach a client streaming from instance B — and
 * the fix is Redis pub/sub behind this same `publish` call. Keeping the seam here
 * means that change touches one file.
 */
const subscribers = new Set<Subscriber>();

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  logger.debug({ subscriberId: subscriber.id, total: subscribers.size }, 'SSE client attached');

  return () => {
    subscribers.delete(subscriber);
    logger.debug({ subscriberId: subscriber.id, total: subscribers.size }, 'SSE client detached');
  };
}

export function publish(event: DomainEvent): void {
  if (subscribers.size === 0) return;

  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;

  for (const subscriber of subscribers) {
    try {
      subscriber.res.write(payload);
    } catch (error) {
      // A dead socket must not stop the rest of the fan-out.
      logger.warn({ err: error, subscriberId: subscriber.id }, 'Failed to write to SSE client');
      subscribers.delete(subscriber);
    }
  }
}

/**
 * Ends every open stream.
 *
 * Without this the process will not exit on SIGTERM: each SSE response is an open
 * connection, and `server.close()` waits for them forever.
 */
export function closeAllStreams(): void {
  for (const subscriber of subscribers) {
    try {
      subscriber.res.end();
    } catch {
      // Already gone; nothing to do.
    }
  }
  subscribers.clear();
}

export function subscriberCount(): number {
  return subscribers.size;
}
