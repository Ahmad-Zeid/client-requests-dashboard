import type { Request, Response } from 'express';

import * as service from './requests.service.js';
import {
  createRequestSchema,
  idParamSchema,
  listRequestsQuerySchema,
  updateStatusSchema,
} from './requests.schema.js';

/**
 * HTTP concerns only: parse, delegate, shape the response.
 *
 * Controllers never touch SQL and never decide domain rules. If a handler here
 * grows past a dozen lines, the logic belongs in the service.
 *
 * Validation happens at the edge — everything past `.parse()` is typed and trusted,
 * so no function downstream has to re-check whether `page` is really a number.
 * A thrown ZodError is caught by the error handler and rendered as a 400.
 */

export async function listRequests(req: Request, res: Response): Promise<void> {
  const query = listRequestsQuerySchema.parse(req.query);
  const { items, pagination } = await service.listRequests(query);

  res.json({ data: items, pagination });
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  res.json({ data: await service.getStats() });
}

export async function getActivity(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);

  res.json({ data: await service.getActivity(id) });
}

export async function createRequest(req: Request, res: Response): Promise<void> {
  const input = createRequestSchema.parse(req.body);
  const created = await service.createRequest(input, actorOf(req));

  // 201 + Location: the caller learns where the new resource lives.
  res.status(201).location(`/api/v1/requests/${created.id}`).json({ data: created });
}

export async function updateRequestStatus(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  const input = updateStatusSchema.parse(req.body);

  const updated = await service.updateRequestStatus(id, input, actorOf(req));

  res.json({ data: updated });
}

/**
 * Who is making the change, taken from the verified session rather than the body.
 *
 * An actor a client can name is an actor a client can forge, and an audit trail that
 * records whatever it was told is worse than no audit trail — it looks authoritative.
 * `requireAuth` has already run on every route here, so `req.user` is present; the
 * fallback exists only so a future unguarded route cannot write an empty actor.
 */
function actorOf(req: Request): string {
  return req.user?.email ?? 'unknown';
}
