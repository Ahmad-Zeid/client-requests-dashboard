-- Client requests — initial schema.

create extension if not exists "pgcrypto";  -- gen_random_uuid()

do $$
begin
  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type request_status as enum ('new', 'in_progress', 'done');
  end if;
end
$$;

create table if not exists client_requests (
  id          uuid primary key default gen_random_uuid(),
  client_name text           not null check (length(trim(client_name)) > 0),
  title       text           not null check (length(trim(title)) > 0),
  description text,
  priority    text           not null default 'medium'
                             check (priority in ('low', 'medium', 'high')),
  status      request_status not null default 'new',

  -- Optimistic concurrency guard. Every status update must present the version it
  -- read; the UPDATE only matches if nobody else has bumped it in the meantime.
  version     integer        not null default 1,

  created_at  timestamptz    not null default now(),
  updated_at  timestamptz    not null default now()
);

-- The dashboard's two access patterns, indexed deliberately:
--   1. filter by status, newest first  (the default table view)
--   2. newest first across all statuses
-- Without these, every page load is a sequential scan plus an in-memory sort —
-- fine at 50 rows, not fine at 500,000.
create index if not exists client_requests_status_created_idx
  on client_requests (status, created_at desc);

create index if not exists client_requests_created_idx
  on client_requests (created_at desc);
