import { useEffect, useMemo, useState } from 'react';

import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { StateBlock } from '../../components/StateBlock';
import { useAuth } from '../auth/AuthContext';
import { NewRequestDialog } from './NewRequestDialog';
import { RequestsTable, RequestsTableSkeleton } from './RequestsTable';
import {
  useAdvanceStatus,
  useRequestStats,
  useRequestsQuery,
  type RequestFilters,
} from './useRequests';
import { NEXT_STATUS, STATUS_LABELS, type ClientRequest, type RequestStatus } from '../../types/request';

const PAGE_SIZE = 10;

const FILTERS: ReadonlyArray<{ value: RequestStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All requests' },
  { value: 'new', label: STATUS_LABELS.new },
  { value: 'in_progress', label: STATUS_LABELS.in_progress },
  { value: 'done', label: STATUS_LABELS.done },
];

export function RequestsPage() {
  const { user, signOut } = useAuth();

  const [status, setStatus] = useState<RequestStatus | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * Debounce the search box. Firing a request per keystroke means the answer to
   * "chec" can land after the answer to "checkout" and overwrite it — the classic
   * out-of-order response bug. 300ms also cuts the request count by an order of
   * magnitude on a normal typing speed.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const filters: RequestFilters = useMemo(
    () => ({ status, q: search, page, pageSize: PAGE_SIZE }),
    [status, search, page],
  );

  const requestsQuery = useRequestsQuery(filters);
  const statsQuery = useRequestStats();
  const advanceStatus = useAdvanceStatus(filters);

  const pendingId = advanceStatus.isPending ? (advanceStatus.variables?.id ?? null) : null;

  function handleAdvance(request: ClientRequest) {
    const next = NEXT_STATUS[request.status];
    if (!next) return;

    advanceStatus.mutate({
      id: request.id,
      status: next,
      // The version this decision was based on. If the row has moved on since,
      // the server rejects the write instead of silently overwriting.
      expectedVersion: request.version,
    });
  }

  function handleFilterChange(value: RequestStatus | 'all') {
    setStatus(value);
    setPage(1);
  }

  const requests = requestsQuery.data?.data ?? [];
  const pagination = requestsQuery.data?.pagination;
  const stats = statsQuery.data;
  const isFiltered = status !== 'all' || search.trim().length > 0;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <nav className="rail" aria-label="Request queue">
        <div className="rail__brand">
          <span className="rail__mark">
            Requests<span className="rail__mark-dot">.</span>
          </span>
        </div>

        <div className="rail__nav">
          <p className="rail__section-label" id="rail-queue-label">
            Queue
          </p>

          <ul
            aria-labelledby="rail-queue-label"
            style={{ listStyle: 'none', margin: 0, padding: 0, display: 'contents' }}
          >
            {FILTERS.map((filter) => (
              <li key={filter.value} style={{ display: 'contents' }}>
                <a
                  className="rail__link"
                  href={`#${filter.value}`}
                  aria-current={status === filter.value ? 'true' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    handleFilterChange(filter.value);
                  }}
                >
                  <span>{filter.label}</span>
                  {stats ? (
                    <span className="rail__count">
                      {filter.value === 'all' ? stats.total : stats[filter.value]}
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="rail__footer">
          <div className="rail__user">
            <span className="rail__avatar" aria-hidden="true">
              {user?.email.slice(0, 1).toUpperCase() ?? '?'}
            </span>
            <span className="rail__user-email">{user?.email}</span>
          </div>
          <Button variant="ghost" size="sm" block leading={<Icon name="signOut" size={14} />} onClick={signOut}>
            Sign out
          </Button>
        </div>
      </nav>

      <main className="main" id="main">
        <header className="page-head">
          <div>
            <h1 className="page-head__title">Client requests</h1>
            <p className="page-head__lede">
              Everything currently in the queue. Advance a request as work moves — the server
              enforces the order, so nothing skips a step or reopens once it is closed.
            </p>
          </div>

          <Button
            variant="primary"
            leading={<Icon name="plus" size={15} />}
            onClick={() => setDialogOpen(true)}
          >
            New request
          </Button>
        </header>

        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Filter by status">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className="segmented__option"
                aria-pressed={status === filter.value}
                onClick={() => handleFilterChange(filter.value)}
              >
                {filter.value === 'all' ? 'All' : filter.label}
              </button>
            ))}
          </div>

          <div className="toolbar__search">
            <label className="visually-hidden" htmlFor="request-search">
              Search requests by title or client
            </label>
            <input
              id="request-search"
              className="input"
              type="search"
              placeholder="Search title or client…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
        </div>

        {/* Loading, error, empty, and populated are four distinct states — each
            gets its own branch rather than one spinner standing in for all of them. */}
        {requestsQuery.isPending ? (
          <RequestsTableSkeleton />
        ) : requestsQuery.isError ? (
          <div className="panel">
            <StateBlock
              icon="alert"
              tone="error"
              title="Could not load the queue"
              body="The API did not respond. It may still be starting up — check that the server is running on port 4000."
              action={
                <Button
                  variant="secondary"
                  state={requestsQuery.isFetching ? 'loading' : 'idle'}
                  loadingLabel="Retrying…"
                  onClick={() => void requestsQuery.refetch()}
                >
                  Try again
                </Button>
              }
            />
          </div>
        ) : requests.length === 0 ? (
          <div className="panel">
            <StateBlock
              icon="inbox"
              title={isFiltered ? 'Nothing matches this view' : 'The queue is empty'}
              body={
                isFiltered
                  ? 'No request matches the current status and search. Clear them to see the whole queue.'
                  : 'Nothing has been logged yet. The first request you add will show up here.'
              }
              action={
                isFiltered ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setStatus('all');
                      setSearchInput('');
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    leading={<Icon name="plus" size={15} />}
                    onClick={() => setDialogOpen(true)}
                  >
                    Log the first request
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            <RequestsTable
              requests={requests}
              pendingId={pendingId}
              onAdvance={handleAdvance}
            />

            {pagination ? (
              <div className="pagination">
                <p className="pagination__summary" aria-live="polite">
                  {pagination.total} request{pagination.total === 1 ? '' : 's'} · page{' '}
                  {pagination.page} of {pagination.totalPages}
                </p>

                <div className="pagination__controls">
                  <Button
                    size="sm"
                    leading={<Icon name="chevronLeft" size={14} />}
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </main>

      <NewRequestDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
