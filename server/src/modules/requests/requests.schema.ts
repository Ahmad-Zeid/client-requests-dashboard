import { z } from 'zod';

export const REQUEST_STATUSES = ['new', 'in_progress', 'done'] as const;
export const REQUEST_PRIORITIES = ['low', 'medium', 'high'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

/**
 * Why a request is being flagged. Derived, never stored — it is a function of the
 * clock, so persisting it would mean a row could be stale the moment nobody wrote to it.
 */
export type RequestAttention = {
  reason: 'unacknowledged_high' | 'waiting_too_long' | 'stalled';
  label: string;
  /** Hours since the timestamp the rule cares about. */
  hours: number;
};

/** The row as the API returns it. camelCase at the boundary, snake_case in the database. */
export type ClientRequest = {
  id: string;
  clientName: string;
  title: string;
  description: string | null;
  priority: RequestPriority;
  status: RequestStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  attention: RequestAttention | null;
};

/**
 * One entry in a request's trail. Stored, unlike `attention` — this is a record of
 * something that happened, so it must survive the clock moving on.
 */
export type RequestEvent = {
  id: string;
  type: 'created' | 'status_changed';
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actor: string;
  version: number;
  createdAt: string;
};

/** A client, with how much of its work is still open. Powers the rail's client list. */
export type ClientSummary = {
  name: string;
  open: number;
  total: number;
};

export const createRequestSchema = z.object({
  clientName: z.string().trim().min(1, 'Client name is required.').max(120),
  title: z.string().trim().min(1, 'Title is required.').max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  priority: z.enum(REQUEST_PRIORITIES).default('medium'),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateStatusSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
  /**
   * The version the client last read. Required, not optional — an update that
   * doesn't say what it thinks it's overwriting is an update that can silently
   * clobber someone else's change.
   */
  expectedVersion: z.coerce.number().int().positive(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const listRequestsQuerySchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  /** Narrow to requests the attention rules have flagged. */
  attention: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  /** Exact client name — the rail's client list navigates by this. */
  client: z.string().trim().max(120).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped: the page size is caller-supplied, so it needs a ceiling or a client
  // can ask for the whole table and turn one request into an outage.
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt:desc', 'createdAt:asc']).default('createdAt:desc'),
});

export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;

export const idParamSchema = z.object({
  id: z.string().uuid('Not a valid request id.'),
});
