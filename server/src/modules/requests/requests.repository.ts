import { pool } from '../../db/pool.js';
import { ATTENTION_SQL } from './requests.attention.js';
import type {
  ClientRequest,
  ClientSummary,
  CreateRequestInput,
  ListRequestsQuery,
  RequestEvent,
  RequestStatus,
} from './requests.schema.js';

/**
 * Data access. SQL lives here and nowhere else.
 *
 * No business rules in this file — the service decides *whether* a status change is
 * legal, the repository only knows how to write one. Keeping the split means the
 * service is testable without a database and the SQL is reviewable on its own.
 *
 * Every query is parameterised. No string interpolation touches user input.
 */

/** Shape as it comes back from Postgres, before mapping to the API's camelCase. */
type Row = {
  id: string;
  client_name: string;
  title: string;
  description: string | null;
  priority: ClientRequest['priority'];
  status: RequestStatus;
  version: number;
  created_at: string;
  updated_at: string;
};

function toClientRequest(row: Row): Omit<ClientRequest, 'attention'> {
  return {
    id: row.id,
    clientName: row.client_name,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = `
  id, client_name, title, description, priority, status, version, created_at, updated_at
`;

export async function findById(id: string): Promise<Omit<ClientRequest, 'attention'> | null> {
  const { rows } = await pool.query<Row>(
    `select ${COLUMNS} from client_requests where id = $1`,
    [id],
  );
  return rows[0] ? toClientRequest(rows[0]) : null;
}

export async function list(
  query: ListRequestsQuery,
): Promise<{ items: Array<Omit<ClientRequest, 'attention'>>; total: number }> {
  const { status, attention, q, page, pageSize, sort } = query;

  // Build the WHERE clause from whichever filters were supplied. Placeholders are
  // numbered as they're appended so the values array always lines up.
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  if (attention) {
    // No placeholder: the fragment is built from named constants, never from input.
    conditions.push(ATTENTION_SQL);
  }

  if (query.client) {
    values.push(query.client);
    conditions.push(`client_name = $${values.length}`);
  }

  if (q) {
    values.push(`%${q}%`);
    conditions.push(`(client_name ilike $${values.length} or title ilike $${values.length})`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const direction = sort === 'createdAt:asc' ? 'asc' : 'desc';

  // Count and page in one round trip. `count(*) over ()` gives the total matching
  // rows alongside the page itself, so the client can render pagination without a
  // second query — and the two can never disagree, because they see one snapshot.
  values.push(pageSize, (page - 1) * pageSize);

  const { rows } = await pool.query<Row & { total_count: string }>(
    `select ${COLUMNS}, count(*) over () as total_count
       from client_requests
       ${where}
      order by created_at ${direction}, id ${direction}
      limit $${values.length - 1} offset $${values.length}`,
    values,
  );

  return {
    items: rows.map(toClientRequest),
    total: rows[0] ? Number(rows[0].total_count) : 0,
  };
}

/**
 * One row per status, in a single grouped scan rather than three round trips.
 * `status` is the leading column of an index, so this stays cheap as the table grows.
 */
export async function countsByStatus(): Promise<Record<RequestStatus, number>> {
  const { rows } = await pool.query<{ status: RequestStatus; count: string }>(
    'select status, count(*)::text as count from client_requests group by status',
  );

  const counts: Record<RequestStatus, number> = { new: 0, in_progress: 0, done: 0 };
  for (const row of rows) {
    counts[row.status] = Number(row.count);
  }
  return counts;
}

/**
 * How many requests the attention rules flag, across the whole table — which is why
 * this is SQL and not a filter over the current page.
 */
export async function countNeedingAttention(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `select count(*)::text as count from client_requests where ${ATTENTION_SQL}`,
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Who has open work, and how much. One grouped scan; `filter` keeps it to a single
 * pass rather than a self-join or two queries reconciled in JavaScript.
 *
 * Ordered by open work first, because a client with nothing outstanding is not
 * something anyone needs at the top of a queue navigator.
 */
export async function countsByClient(limit: number): Promise<ClientSummary[]> {
  const { rows } = await pool.query<{ name: string; open: string; total: string }>(
    `select client_name as name,
            count(*) filter (where status <> 'done')::text as open,
            count(*)::text                                 as total
       from client_requests
      group by client_name
      order by count(*) filter (where status <> 'done') desc, client_name asc
      limit $1`,
    [limit],
  );

  return rows.map((row) => ({
    name: row.name,
    open: Number(row.open),
    total: Number(row.total),
  }));
}

/** One request's trail, oldest first — a timeline reads forwards. */
export async function listEvents(requestId: string): Promise<RequestEvent[]> {
  const { rows } = await pool.query<{
    id: string;
    type: RequestEvent['type'];
    from_status: RequestStatus | null;
    to_status: RequestStatus;
    actor: string;
    version: number;
    created_at: string;
  }>(
    `select id::text, type, from_status, to_status, actor, version, created_at
       from request_events
      where request_id = $1
      order by id asc`,
    [requestId],
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actor: row.actor,
    version: row.version,
    createdAt: row.created_at,
  }));
}

/**
 * Insert the row and its first event in one statement.
 *
 * A single statement is atomic without opening an explicit transaction, so there is
 * no window in which a request exists with no history — and no pooled client held
 * across two round trips. The data-modifying CTE is the reason this works: `created`
 * runs once, and both the event insert and the final select read from that one result.
 */
export async function create(
  input: CreateRequestInput,
  actor: string,
): Promise<Omit<ClientRequest, 'attention'>> {
  const { rows } = await pool.query<Row>(
    `with created as (
       insert into client_requests (client_name, title, description, priority)
       values ($1, $2, $3, $4)
       returning ${COLUMNS}
     ), logged as (
       insert into request_events (request_id, type, from_status, to_status, actor, version)
       select id, 'created', null, status, $5, version from created
     )
     select ${COLUMNS} from created`,
    [input.clientName, input.title, input.description || null, input.priority, actor],
  );

  // `returning` guarantees exactly one row on a successful insert.
  return toClientRequest(rows[0]!);
}

/**
 * Compare-and-set on `version`.
 *
 * The WHERE clause carries the version the caller read. If another writer has
 * bumped it in between, zero rows match and we return null — the caller turns that
 * into a 409 rather than silently overwriting the other change. This is the whole
 * lost-update problem solved in one predicate, with no table locks and no
 * read-then-write race, because the check and the write are the same statement.
 */
export async function updateStatusIfVersionMatches(
  id: string,
  status: RequestStatus,
  expectedVersion: number,
  actor: string,
  fromStatus: RequestStatus,
): Promise<Omit<ClientRequest, 'attention'> | null> {
  const { rows } = await pool.query<Row>(
    `with updated as (
       update client_requests
          set status = $1,
              version = version + 1,
              updated_at = now()
        where id = $2
          and version = $3
        returning ${COLUMNS}
     ), logged as (
       insert into request_events (request_id, type, from_status, to_status, actor, version)
       select id, 'status_changed', $5, status, $4, version from updated
     )
     select ${COLUMNS} from updated`,
    [status, id, expectedVersion, actor, fromStatus],
  );

  // Zero rows means the compare-and-set lost — and because the event insert reads
  // from `updated`, no history is written for a write that did not happen.
  return rows[0] ? toClientRequest(rows[0]) : null;
}
