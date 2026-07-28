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
  await pool.query('truncate table client_requests cascade');
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

describe('activity trail', () => {
  it('records creation, attributed to the session that made it', async () => {
    const created = await createRequestRow();

    const response = await request(app)
      .get(`/api/v1/requests/${created.id}/activity`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      type: 'created',
      fromStatus: null,
      toStatus: 'new',
      version: 1,
      // Taken from the verified token, never from the request body — an actor a
      // client can name is an actor a client can forge.
      actor: env.DEMO_USER_EMAIL,
    });
  });

  it('appends one entry per status change, in order, with the resulting version', async () => {
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
      .get(`/api/v1/requests/${created.id}/activity`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      response.body.data.map((event: { fromStatus: string; toStatus: string; version: number }) => [
        event.fromStatus,
        event.toStatus,
        event.version,
      ]),
    ).toEqual([
      [null, 'new', 1],
      ['new', 'in_progress', 2],
      ['in_progress', 'done', 3],
    ]);
  });

  /**
   * The row write and its event are one statement, so a rejected write cannot leave
   * history behind. Without that guarantee the trail would eventually record changes
   * that never happened — which is worse than having no trail, because it looks
   * authoritative.
   */
  it('writes nothing when the compare-and-set loses', async () => {
    const created = await createRequestRow();

    await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', expectedVersion: 1 })
      .expect(200);

    // Same version again: this caller is working from a state that has moved on.
    await request(app)
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', expectedVersion: 1 })
      .expect(409);

    const response = await request(app)
      .get(`/api/v1/requests/${created.id}/activity`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(2);
  });

  it('404s for a request that does not exist', async () => {
    await request(app)
      .get('/api/v1/requests/00000000-0000-4000-8000-000000000000/activity')
      .set('authorization', `Bearer ${token}`)
      .expect(404);
  });
});

describe('client scoping', () => {
  it('narrows the list to one client and counts open work per client', async () => {
    const finished = await createRequestRow({ clientName: 'Olive & Thyme', title: 'Closed one' });
    await createRequestRow({ clientName: 'Olive & Thyme', title: 'Open one' });
    await createRequestRow({ clientName: 'Rawi Books', title: 'Someone else' });

    for (const [status, version] of [['in_progress', 1], ['done', 2]] as const) {
      await request(app)
        .patch(`/api/v1/requests/${finished.id}/status`)
        .set('authorization', `Bearer ${token}`)
        .send({ status, expectedVersion: version })
        .expect(200);
    }

    const list = await request(app)
      .get('/api/v1/requests?client=Olive%20%26%20Thyme')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body.data).toHaveLength(2);
    expect(list.body.pagination.total).toBe(2);

    const stats = await request(app)
      .get('/api/v1/requests/stats')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    // Counted as *open* work, not total — a client with nothing outstanding needs
    // nothing from you, and the rail is a queue navigator rather than a report.
    expect(stats.body.data.clients).toContainEqual({ name: 'Olive & Thyme', open: 1, total: 2 });
    expect(stats.body.data.clients).toContainEqual({ name: 'Rawi Books', open: 1, total: 1 });
  });
});

describe('stream tickets', () => {
  it('refuses to issue a ticket without a session', async () => {
    await request(app).post('/api/v1/events/ticket').expect(401);
  });

  it('issues a ticket that opens the stream exactly once', async () => {
    const issued = await request(app)
      .post('/api/v1/events/ticket')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    const { ticket } = issued.body.data;
    expect(typeof ticket).toBe('string');

    // Supertest holds the connection open for a streaming response, so the first
    // redemption is checked by its headers and then abandoned.
    const stream = request(app).get(`/api/v1/events?ticket=${encodeURIComponent(ticket)}`);
    await new Promise<void>((resolve, reject) => {
      stream
        .buffer(false)
        .parse((res, callback) => {
          expect(res.headers['content-type']).toContain('text/event-stream');
          res.destroy();
          callback(null, null);
          resolve();
        })
        .end((error) => {
          if (error && !/socket hang up|aborted|ECONNRESET/.test(error.message)) reject(error);
        });
    });

    // The whole point of a ticket over a token in the query string: a leaked one is
    // worth nothing, because it has already been spent.
    await request(app).get(`/api/v1/events?ticket=${encodeURIComponent(ticket)}`).expect(401);
  });

  it('rejects a ticket it never issued', async () => {
    await request(app).get('/api/v1/events?ticket=forged').expect(401);
  });
});

describe('attention rules', () => {
  /**
   * The rules are a function of the clock, so the only honest way to test them is to
   * write rows with known ages. Inserted directly rather than through the API: the
   * API refuses to let a caller choose when a request arrived, which is correct, and
   * is exactly why the fixture has to go around it.
   */
  async function seedAged(
    title: string,
    status: 'new' | 'in_progress',
    priority: 'low' | 'medium' | 'high',
    ageHours: number,
    touchedHoursAgo = ageHours,
  ) {
    await pool.query(
      `insert into client_requests (client_name, title, priority, status, created_at, updated_at)
       values ('Fixture', $1, $2, $3, now() - ($4 * interval '1 hour'), now() - ($5 * interval '1 hour'))`,
      [title, priority, status, ageHours, touchedHoursAgo],
    );
  }

  it('flags each kind of neglect, and leaves healthy requests alone', async () => {
    await seedAged('Unacknowledged high', 'new', 'high', 30);
    await seedAged('Waiting far too long', 'new', 'medium', 100);
    await seedAged('Started then forgotten', 'in_progress', 'medium', 300, 140);

    // Controls, one just inside each threshold.
    await seedAged('Fresh high', 'new', 'high', 2);
    await seedAged('Recently worked', 'in_progress', 'medium', 300, 4);

    const response = await request(app)
      .get('/api/v1/requests?attention=true')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.map((row: ClientRequest) => row.title).sort()).toEqual([
      'Started then forgotten',
      'Unacknowledged high',
      'Waiting far too long',
    ]);

    expect(
      response.body.data.map((row: ClientRequest) => row.attention?.reason).sort(),
    ).toEqual(['stalled', 'unacknowledged_high', 'waiting_too_long']);

    // The filter and the count are two different implementations of one rule — the
    // JavaScript predicate and the SQL fragment — so they are worth comparing.
    const stats = await request(app)
      .get('/api/v1/requests/stats')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(stats.body.data.needsAttention).toBe(3);
  });

  it('reports no attention on a request that has just arrived', async () => {
    const created = await createRequestRow();
    expect(created.attention).toBeNull();
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
