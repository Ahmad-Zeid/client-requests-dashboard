import { pool } from '../../db/pool.js';
import type {
  ClientRequest,
  CreateRequestInput,
  ListRequestsQuery,
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

function toClientRequest(row: Row): ClientRequest {
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

export async function findById(id: string): Promise<ClientRequest | null> {
  const { rows } = await pool.query<Row>(
    `select ${COLUMNS} from client_requests where id = $1`,
    [id],
  );
  return rows[0] ? toClientRequest(rows[0]) : null;
}

export async function list(
  query: ListRequestsQuery,
): Promise<{ items: ClientRequest[]; total: number }> {
  const { status, q, page, pageSize, sort } = query;

  // Build the WHERE clause from whichever filters were supplied. Placeholders are
  // numbered as they're appended so the values array always lines up.
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
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

export async function create(input: CreateRequestInput): Promise<ClientRequest> {
  const { rows } = await pool.query<Row>(
    `insert into client_requests (client_name, title, description, priority)
     values ($1, $2, $3, $4)
     returning ${COLUMNS}`,
    [input.clientName, input.title, input.description || null, input.priority],
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
): Promise<ClientRequest | null> {
  const { rows } = await pool.query<Row>(
    `update client_requests
        set status = $1,
            version = version + 1,
            updated_at = now()
      where id = $2
        and version = $3
      returning ${COLUMNS}`,
    [status, id, expectedVersion],
  );

  return rows[0] ? toClientRequest(rows[0]) : null;
}
