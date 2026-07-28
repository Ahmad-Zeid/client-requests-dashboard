import { z } from 'zod';

export const REQUEST_STATUSES = ['new', 'in_progress', 'done'] as const;
export const REQUEST_PRIORITIES = ['low', 'medium', 'high'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

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
