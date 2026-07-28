import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { migrate } from '../src/db/migrate.js';
import { closePool, pool } from '../src/db/pool.js';
import type { ClientRequest } from '../src/modules/requests/requests.schema.js';

/**
 * Integration tests against a real Postgres.
 *
 * Deliberately not mocked: the parts most worth testing here — the version
 * compare-and-set, the enum constraint, the pagination envelope — are exactly the
 * parts a mock would paper over. The app is mounted in-process by Supertest, so
 * there is no port to bind and no server to tear down.
 */

let app: Express;
let token: string;

async function createRequestRow(overrides: Partial<{ clientName: string; title: string }> = {}) {
  const response = await request(app)
    .post('/api/v1/requests')
    .set('authorization', `Bearer ${token}`)
    .send({
      clientName: overrides.clientName ?? 'Cedar Grove Grocers',
      title: overrides.title ?? 'Restore the gift-wrap option at checkout',
    })
    .expect(201);

  return response.body.data as ClientRequest;
}

beforeAll(async () => {
  await migrate();
  app = createApp();

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: env.DEMO_USER_EMAIL, password: env.DEMO_USER_PASSWORD })
    .expect(200);

  token = login.body.data.token;
});

beforeEach(async () => {
  // Each test starts from a known-empty table so assertions on counts are stable.
  await pool.query('truncate table client_requests');
});

afterAll(async () => {
  await closePool();
});

describe('auth boundary', () => {
  it('rejects a request with no bearer token', async () => {
    const response = await request(app).get('/api/v1/requests').expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.requestId).toEqual(expect.any(String));
  });

  it('rejects a token that has been tampered with', async () => {
    await request(app)
      .get('/api/v1/requests')
      .set('authorization', `Bearer ${token.slice(0, -4)}beef`)
      .expect(401);
  });
});

describe('validation', () => {
  it('returns 400 with field details when clientName is missing', async () => {
    const response = await request(app)
      .post('/api/v1/requests')
      .set('authorization', `Bearer ${token}`)
      .send({ title: 'Missing its client' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'clientName' }),
    );
  });
});

describe('status state machine', () => {
  it('allows new → in_progress → done, incrementing version each time', async () => {
    const created = await createRequestRow();
    expect(created.status).toBe('new');
    expect(created.version).toBe(1);

    const started = await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', expectedVersion: created.version })
      .expect(200);

    expect(started.body.data).toMatchObject({ status: 'in_progress', version: 2 });

    const finished = await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'done', expectedVersion: started.body.data.version })
      .expect(200);

    expect(finished.body.data).toMatchObject({ status: 'done', version: 3 });
  });

  it('rejects skipping a step (new → done) with 422', async () => {
    const created = await createRequestRow();

    const response = await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'done', expectedVersion: created.version })
      .expect(422);

    expect(response.body.error.code).toBe('INVALID_TRANSITION');
    expect(response.body.error.details).toMatchObject({
      from: 'new',
      requested: 'done',
      allowed: ['in_progress'],
    });
  });

  it('rejects any transition out of the terminal done state', async () => {
    const created = await createRequestRow();

    await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', expectedVersion: 1 })
      .expect(200);

    await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'done', expectedVersion: 2 })
      .expect(200);

    const response = await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', expectedVersion: 3 })
      .expect(422);

    expect(response.body.error.details.allowed).toEqual([]);
  });
});

describe('optimistic concurrency', () => {
  it('returns 409 with the current row when the version is stale', async () => {
    const created = await createRequestRow();

    // First writer wins.
    await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', expectedVersion: 1 })
      .expect(200);

    // Second writer is still holding version 1 — the read it based its decision on
    // is now stale, so the write must be refused rather than silently applied.
    const response = await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'done', expectedVersion: 1 })
      .expect(409);

    expect(response.body.error.code).toBe('VERSION_CONFLICT');
    // The live row rides along so the client can reconcile without a second request.
    expect(response.body.error.details.current).toMatchObject({
      status: 'in_progress',
      version: 2,
    });
  });

  it('reports a stale version as a conflict even when the transition is also illegal', async () => {
    const created = await createRequestRow();

    // Someone else starts it. Our caller still thinks the row is `new` at v1.
    await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', expectedVersion: 1 })
      .expect(200);

    // Replaying the same request is now *both* stale and an illegal
    // in_progress → in_progress move. Staleness is the useful answer: the caller
    // never chose to make that transition, it chose new → in_progress against a
    // row that has since moved. Answering INVALID_TRANSITION would describe a
    // decision they did not make.
    const response = await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', expectedVersion: 1 })
      .expect(409);

    expect(response.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('listing', () => {
  it('returns the paginated envelope and respects pageSize', async () => {
    for (let i = 0; i < 3; i += 1) {
      await createRequestRow({ title: `Request ${i}` });
    }

    const response = await request(app)
      .get('/api/v1/requests?pageSize=2&page=1')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it('filters by status', async () => {
    const a = await createRequestRow({ title: 'Stays new' });
    const b = await createRequestRow({ title: 'Gets started' });

    await request(app)
      .patch(`/api/v1/requests/${b.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', expectedVersion: 1 })
      .expect(200);

    const response = await request(app)
      .get('/api/v1/requests?status=new')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(a.id);
  });
});

describe('health', () => {
  it('reports database connectivity', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      checks: { database: 'ok' },
    });
  });
});
