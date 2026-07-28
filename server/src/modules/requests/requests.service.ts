import { ApiError } from '../../lib/ApiError.js';
import { publish } from '../../lib/eventBus.js';
import { attentionFor } from './requests.attention.js';
import * as repository from './requests.repository.js';
import type {
  ClientRequest,
  ClientSummary,
  CreateRequestInput,
  ListRequestsQuery,
  RequestEvent,
  RequestStatus,
  UpdateStatusInput,
} from './requests.schema.js';

/**
 * Business rules. No SQL, no HTTP — just the domain.
 */

/**
 * The request lifecycle, as data rather than as a pile of if-statements.
 *
 * `new → in_progress → done`, forward only. Nothing reopens a completed request;
 * that would be a different operation with a different audit meaning, not a
 * backwards step through this machine.
 *
 * This table lives on the server on purpose. The UI reads it to decide what to
 * render, but the server is what *enforces* it — a client that posts an illegal
 * transition (or a curl call that skips the UI entirely) gets a 422. A rule the
 * client alone enforces is a rule the system does not actually have.
 */
const ALLOWED_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  new: ['in_progress'],
  in_progress: ['done'],
  done: [],
};

export function nextStatus(current: RequestStatus): RequestStatus | null {
  return ALLOWED_TRANSITIONS[current][0] ?? null;
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Decorates a stored row with its derived attention state.
 *
 * Every path out of this service goes through here, so a request can never reach the
 * API with the field missing or computed against a different clock — all rows in one
 * response are evaluated against a single `now`.
 */
function decorate(
  request: Omit<ClientRequest, 'attention'>,
  now: number = Date.now(),
): ClientRequest {
  return { ...request, attention: attentionFor(request, now) };
}

export type ListResult = {
  items: ClientRequest[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export async function listRequests(query: ListRequestsQuery): Promise<ListResult> {
  const { items, total } = await repository.list(query);
  const now = Date.now();

  return {
    items: items.map((item) => decorate(item, now)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export type RequestStats = Record<RequestStatus, number> & {
  total: number;
  needsAttention: number;
  clients: ClientSummary[];
};

/** How many clients the rail lists before it stops being a navigator and starts being a report. */
const CLIENT_LIST_LIMIT = 8;

export async function getStats(): Promise<RequestStats> {
  // Three independent aggregates, so they go out together rather than in sequence.
  const [counts, needsAttention, clients] = await Promise.all([
    repository.countsByStatus(),
    repository.countNeedingAttention(),
    repository.countsByClient(CLIENT_LIST_LIMIT),
  ]);

  return {
    ...counts,
    total: counts.new + counts.in_progress + counts.done,
    needsAttention,
    clients,
  };
}

/**
 * The trail for one request.
 *
 * A separate call rather than an `events` field on the row: the list endpoint returns
 * fifty requests at a time and nobody reads fifty timelines, so folding them in would
 * mean fetching hundreds of rows to render none of them.
 */
export async function getActivity(id: string): Promise<RequestEvent[]> {
  const request = await repository.findById(id);

  if (!request) {
    throw ApiError.notFound(`No client request with id ${id}.`);
  }

  return repository.listEvents(id);
}

export async function createRequest(
  input: CreateRequestInput,
  actor: string,
): Promise<ClientRequest> {
  // Every request starts at `new`; the client does not get to choose a starting
  // status, or it could skip straight to done and bypass the machine entirely.
  const created = decorate(await repository.create(input, actor));

  // Announced after the write has committed, never before — a listener that reacted
  // to an event for a row that then failed to save would be showing a lie.
  publish({ type: 'request.created', data: created });

  return created;
}

export async function updateRequestStatus(
  id: string,
  input: UpdateStatusInput,
  actor: string,
): Promise<ClientRequest> {
  const current = await repository.findById(id);

  if (!current) {
    throw ApiError.notFound(`No client request with id ${id}.`);
  }

  /**
   * Staleness is checked before legality, and the order matters.
   *
   * If the caller's version is out of date then the transition it asked for was
   * chosen against a state that has since moved on — so judging that transition
   * tells the user the wrong story. Someone who clicks "Start work" on a row that
   * another person already started should be told "this changed underneath you",
   * not "new cannot move to in_progress", which is true but describes a decision
   * they never actually made.
   *
   * The compare-and-set below is still the real guard; this is here to make the
   * common case explicable.
   */
  if (current.version !== input.expectedVersion) {
    throw ApiError.versionConflict(
      'This request was changed by someone else while you were looking at it.',
      { current: decorate(current) },
    );
  }

  if (!canTransition(current.status, input.status)) {
    const allowed = ALLOWED_TRANSITIONS[current.status];
    throw ApiError.invalidTransition(
      allowed.length
        ? `A request that is “${current.status}” can only move to “${allowed.join('”, “')}”.`
        : `This request is already “${current.status}” and cannot change status again.`,
      { from: current.status, requested: input.status, allowed },
    );
  }

  const updated = await repository.updateStatusIfVersionMatches(
    id,
    input.status,
    input.expectedVersion,
    actor,
    current.status,
  );

  if (updated) {
    const decorated = decorate(updated);
    publish({ type: 'request.updated', data: decorated });
    return decorated;
  }

  /**
   * The row existed a moment ago, the version matched, and the transition was legal —
   * so reaching here means another writer landed in the gap between that read and
   * this write. Rare, but the compare-and-set is what makes it safe rather than silent.
   */
  const latest = await repository.findById(id);

  throw ApiError.versionConflict(
    'This request was changed by someone else while you were looking at it.',
    { current: latest ? decorate(latest) : null },
  );
}
