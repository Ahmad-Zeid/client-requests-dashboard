import { ApiError } from '../../lib/ApiError.js';
import * as repository from './requests.repository.js';
import type {
  ClientRequest,
  CreateRequestInput,
  ListRequestsQuery,
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

  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export type RequestStats = Record<RequestStatus, number> & { total: number };

export async function getStats(): Promise<RequestStats> {
  const counts = await repository.countsByStatus();
  return { ...counts, total: counts.new + counts.in_progress + counts.done };
}

export async function createRequest(input: CreateRequestInput): Promise<ClientRequest> {
  // Every request starts at `new`; the client does not get to choose a starting
  // status, or it could skip straight to done and bypass the machine entirely.
  return repository.create(input);
}

export async function updateRequestStatus(
  id: string,
  input: UpdateStatusInput,
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
      { current },
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
  );

  if (!updated) {
    // The row existed a moment ago and the transition was legal, so a null here
    // means the version moved underneath us — someone else updated it first.
    const latest = await repository.findById(id);

    throw ApiError.versionConflict(
      'This request was changed by someone else while you were looking at it.',
      { current: latest },
    );
  }

  return updated;
}
