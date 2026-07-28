import type { ClientRequest, RequestAttention } from './requests.schema.js';

/**
 * When a request stops being fine and starts being a problem.
 *
 * The failure mode this product exists to prevent is a client request going quiet —
 * not a request being slow, but nobody noticing it is slow. These thresholds are the
 * whole opinion of the app, so they live in one place with a name each rather than
 * as magic numbers scattered through a query.
 *
 * Deliberately derived rather than stored: "has this been waiting too long" is a
 * function of the current time, so a stored flag would go stale in a row nobody wrote to.
 */
export const ATTENTION_THRESHOLDS = {
  /** A high-priority request nobody has even acknowledged. */
  unacknowledgedHighHours: 24,
  /** Any new request that has simply sat there. */
  waitingTooLongHours: 72,
  /** Started, then forgotten — worse than untouched, because someone claimed it. */
  stalledHours: 24 * 5,
} as const;

const HOUR_MS = 60 * 60 * 1000;

function hoursSince(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / HOUR_MS);
}

/**
 * The rules, in priority order — the first match wins, so a request is only ever
 * flagged for its most urgent reason rather than three at once.
 */
export function attentionFor(
  request: Omit<ClientRequest, 'attention'>,
  now: number = Date.now(),
): RequestAttention | null {
  const age = hoursSince(request.createdAt, now);
  const sinceChange = hoursSince(request.updatedAt, now);

  if (
    request.status === 'new' &&
    request.priority === 'high' &&
    age >= ATTENTION_THRESHOLDS.unacknowledgedHighHours
  ) {
    return {
      reason: 'unacknowledged_high',
      label: `High priority, unacknowledged for ${formatDuration(age)}`,
      hours: age,
    };
  }

  if (request.status === 'new' && age >= ATTENTION_THRESHOLDS.waitingTooLongHours) {
    return {
      reason: 'waiting_too_long',
      label: `Waiting ${formatDuration(age)} with no response`,
      hours: age,
    };
  }

  if (request.status === 'in_progress' && sinceChange >= ATTENTION_THRESHOLDS.stalledHours) {
    return {
      reason: 'stalled',
      label: `In progress but untouched for ${formatDuration(sinceChange)}`,
      hours: sinceChange,
    };
  }

  return null;
}

function formatDuration(hours: number): string {
  if (hours < 48) return `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

/**
 * The same rules as SQL, for counting and filtering across the whole table — which
 * cannot be done in JavaScript over one page of results.
 *
 * Built from the constants above rather than hard-coded, so the two can never drift
 * apart. There is a test asserting the SQL and the function agree on the same row.
 */
export const ATTENTION_SQL = `(
     (status = 'new' AND priority = 'high' AND created_at <= now() - interval '${ATTENTION_THRESHOLDS.unacknowledgedHighHours} hours')
  OR (status = 'new' AND created_at <= now() - interval '${ATTENTION_THRESHOLDS.waitingTooLongHours} hours')
  OR (status = 'in_progress' AND updated_at <= now() - interval '${ATTENTION_THRESHOLDS.stalledHours} hours')
)`;
