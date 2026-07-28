import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import * as controller from './requests.controller.js';

export const requestsRouter = Router();

// Everything below this line requires a valid session.
requestsRouter.use(requireAuth);

requestsRouter.get('/', controller.listRequests);

// Declared before any `/:id` route so "stats" is never read as an id.
requestsRouter.get('/stats', controller.getStats);

requestsRouter.post('/', controller.createRequest);

/**
 * PATCH, not PUT: this replaces one field, not the whole resource. And a dedicated
 * `/status` sub-resource rather than a general-purpose PATCH on the request itself,
 * because a status change is a distinct operation with its own rules — it runs
 * through the state machine, and it is the only field a user can change after creation.
 */
requestsRouter.patch('/:id/status', controller.updateRequestStatus);
