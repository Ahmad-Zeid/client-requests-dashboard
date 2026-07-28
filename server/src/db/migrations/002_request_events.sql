-- An append-only trail of what happened to each request.
--
-- `client_requests` holds the *current* state; this holds how it got there. The
-- distinction matters in production: when someone reports "this was marked done and
-- it shouldn't have been", the row alone cannot answer who did it or when, and the
-- application log has usually rotated away. A domain event table is the cheapest
-- thing that can answer it a month later.
--
-- Append-only by convention: nothing in the application updates or deletes a row
-- here. The rows go in inside the same statement as the write they describe, so a
-- status change that commits without its event — or an event without its change —
-- is not a state the database can reach.

create table if not exists request_events (
  id          bigserial   primary key,
  request_id  uuid        not null references client_requests (id) on delete cascade,

  type        text        not null check (type in ('created', 'status_changed')),
  from_status request_status,          -- null on creation: nothing preceded it
  to_status   request_status not null,

  -- Who, and which version the write produced. Storing the version lets the trail be
  -- lined up against the optimistic-concurrency check that allowed the write through.
  actor       text        not null,
  version     integer     not null,

  created_at  timestamptz not null default now()
);

-- The only read pattern: one request's trail, newest first. Composite so the sort is
-- served by the index rather than by an in-memory sort after the lookup.
create index if not exists request_events_request_idx
  on request_events (request_id, id desc);
