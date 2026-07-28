import { randomBytes } from 'node:crypto';

import type { SessionUser } from '../auth/auth.tokens.js';

type Ticket = {
  user: SessionUser;
  expiresAt: number;
};

const TICKET_TTL_MS = 30_000;

const tickets = new Map<string, Ticket>();

/**
 * Short-lived, single-use credentials for the SSE stream.
 *
 * The problem: `EventSource` cannot send an `Authorization` header. There is no API
 * for it. The usual workaround is to put the session token in the query string —
 * which then lands in every access log, proxy cache and `Referer` header along the
 * way, and it is valid for the next eight hours.
 *
 * So the client trades its bearer token for a ticket that is good for thirty
 * seconds and exactly one connection. If one leaks it is worthless by the time
 * anyone reads the log.
 *
 * In a multi-instance deployment this map becomes a Redis key with a TTL; the
 * interface does not change.
 */
export function issueTicket(user: SessionUser): { ticket: string; expiresIn: number } {
  const ticket = randomBytes(24).toString('base64url');
  tickets.set(ticket, { user, expiresAt: Date.now() + TICKET_TTL_MS });
  return { ticket, expiresIn: TICKET_TTL_MS / 1000 };
}

/** Redeems a ticket. Returns null if unknown, already used, or expired. */
export function redeemTicket(ticket: string): SessionUser | null {
  const entry = tickets.get(ticket);
  if (!entry) return null;

  // Single use: gone whether or not it turns out to be expired.
  tickets.delete(ticket);

  return entry.expiresAt >= Date.now() ? entry.user : null;
}

/**
 * Expired tickets are normally removed on redemption, but one that is never
 * redeemed would sit in the map forever. Unref'd so it cannot hold the process open.
 */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(ticket);
  }
}, TICKET_TTL_MS);

sweeper.unref();
