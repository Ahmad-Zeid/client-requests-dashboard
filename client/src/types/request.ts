/**
 * The API contract, mirrored on the client.
 *
 * In a larger codebase these types would be generated from an OpenAPI document or
 * shared through a workspace package so the two sides cannot drift. At this size a
 * hand-kept mirror is honest and readable — but it is a deliberate trade, not an
 * oversight, and it is the first thing to replace as the surface grows.
 */

export const REQUEST_STATUSES = ['new', 'in_progress', 'done'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ['low', 'medium', 'high'] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export type ClientRequest = {
  id: string;
  clientName: string;
  title: string;
  description: string | null;
  priority: RequestPriority;
  status: RequestStatus;
  /** Bumped by the server on every write; sent back on update to detect conflicts. */
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedRequests = {
  data: ClientRequest[];
  pagination: Pagination;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

/** Presentation metadata for each status, kept in one place. */
export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  done: 'Done',
};

/**
 * The client's copy of the lifecycle, used only to label the button and decide
 * what to render. The server owns the real rule and rejects anything illegal —
 * this table is a convenience, not an authority.
 */
export const NEXT_STATUS: Record<RequestStatus, RequestStatus | null> = {
  new: 'in_progress',
  in_progress: 'done',
  done: null,
};

/** The verb on the advance button — named for what it does, not "Next". */
export const ADVANCE_LABELS: Record<RequestStatus, string | null> = {
  new: 'Start work',
  in_progress: 'Mark done',
  done: null,
};
