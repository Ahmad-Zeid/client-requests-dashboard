import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Kbd } from '../../components/Kbd';
import { ShortcutsDialog } from '../../components/ShortcutsDialog';
import { StateBlock } from '../../components/StateBlock';
import { MOD_KEY, useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import {
  NEXT_STATUS,
  STATUS_LABELS,
  type ClientRequest,
  type RequestStatus,
} from '../../types/request';
import { useAuth } from '../auth/AuthContext';
import { CommandPalette } from '../command/CommandPalette';
import type { Command } from '../command/commands';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useTheme } from '../theme/ThemeProvider';
import { NewRequestDialog } from './NewRequestDialog';
import { RequestDrawer } from './RequestDrawer';
import { RequestsTable, RequestsTableSkeleton } from './RequestsTable';
import {
  useAdvanceStatus,
  useRequestStats,
  useRequestsQuery,
  type RequestFilters,
} from './useRequests';

const PAGE_SIZE = 25;

type FilterValue = RequestStatus | 'all';

const FILTERS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: STATUS_LABELS.new },
  { value: 'in_progress', label: STATUS_LABELS.in_progress },
  { value: 'done', label: STATUS_LABELS.done },
];

export function RequestsPage() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<FilterValue>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [grouped, setGrouped] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<RequestStatus>>(new Set());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  /**
   * Debounced search. Firing per keystroke means the answer to "chec" can land
   * after the answer to "checkout" and overwrite it — the classic out-of-order
   * response bug — and costs an order of magnitude more requests.
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

  const requests = useMemo(() => requestsQuery.data?.data ?? [], [requestsQuery.data]);
  const pagination = requestsQuery.data?.pagination;
  const stats = statsQuery.data;

  const pendingId = advanceStatus.isPending ? (advanceStatus.variables?.id ?? null) : null;
  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const drawerRequest = requests.find((request) => request.id === drawerId) ?? null;
  const isFiltered = status !== 'all' || search.trim().length > 0;

  const advance = useCallback(
    (request: ClientRequest) => {
      const next = NEXT_STATUS[request.status];
      if (!next) return;

      setFlashId(request.id);
      // Long enough for the 400ms flash to finish; re-arming needs a fresh id.
      window.setTimeout(() => setFlashId((current) => (current === request.id ? null : current)), 600);

      advanceStatus.mutate({
        id: request.id,
        status: next,
        // The version this decision was based on. If the row has moved on since,
        // the server rejects the write instead of silently overwriting.
        expectedVersion: request.version,
      });
    },
    [advanceStatus],
  );

  const changeFilter = useCallback((value: FilterValue) => {
    setStatus(value);
    setPage(1);
    setSelectedId(null);
  }, []);

  /** Moves the selection by `delta`, starting from the top if nothing is selected. */
  const moveSelection = useCallback(
    (delta: number) => {
      if (requests.length === 0) return;

      const currentIndex = requests.findIndex((request) => request.id === selectedId);
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : requests.length - 1
          : Math.min(Math.max(currentIndex + delta, 0), requests.length - 1);

      const next = requests[nextIndex];
      if (!next) return;

      setSelectedId(next.id);
      document
        .querySelector(`[data-selected='true']`)
        ?.scrollIntoView({ block: 'nearest' });
    },
    [requests, selectedId],
  );

  const toggleGroup = useCallback((group: RequestStatus) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const anyOverlayOpen = paletteOpen || dialogOpen || shortcutsOpen || drawerId !== null;

  /**
   * The whole set is disabled while any overlay is open. Each overlay is a native
   * `<dialog>`, so it already owns Escape and traps focus — leaving the page-level
   * shortcuts armed underneath would mean typing in the new-request form also
   * moved the selection behind it.
   */
  useKeyboardShortcuts(
    [
      // ⌘K works from anywhere, including inside a text field — that is the point of it.
      { key: 'k', meta: true, allowWhileTyping: true, run: () => setPaletteOpen(true) },
      { key: 'escape', allowWhileTyping: true, run: () => setSelectedId(null) },
      { key: '/', run: () => searchRef.current?.focus() },
      { key: 'c', run: () => setDialogOpen(true) },
      { key: '?', run: () => setShortcutsOpen(true) },
      { key: 'j', run: () => moveSelection(1) },
      { key: 'k', run: () => moveSelection(-1) },
      { key: 'arrowdown', run: () => moveSelection(1) },
      { key: 'arrowup', run: () => moveSelection(-1) },
      { key: 'enter', run: () => selected && setDrawerId(selected.id) },
      { key: 'e', run: () => selected && advance(selected) },
      { key: '1', run: () => changeFilter('all') },
      { key: '2', run: () => changeFilter('new') },
      { key: '3', run: () => changeFilter('in_progress') },
      { key: '4', run: () => changeFilter('done') },
    ],
    !anyOverlayOpen,
  );

  /** The palette's action list, rebuilt as context changes. */
  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      {
        id: 'new-request',
        label: 'New request',
        group: 'Actions',
        icon: 'plus',
        hint: 'C',
        keywords: 'create add log',
        run: () => setDialogOpen(true),
      },
    ];

    if (selected) {
      const next = NEXT_STATUS[selected.status];
      if (next) {
        list.push({
          id: 'advance-selected',
          label: `Advance “${selected.title}” to ${STATUS_LABELS[next]}`,
          group: 'Actions',
          icon: 'arrowRight',
          hint: 'E',
          keywords: 'status move start done',
          run: () => advance(selected),
        });
      }
    }

    for (const filter of FILTERS) {
      list.push({
        id: `filter-${filter.value}`,
        label: `Show ${filter.label.toLowerCase()}`,
        group: 'Filter',
        icon: 'filter',
        keywords: 'status filter view',
        run: () => changeFilter(filter.value),
      });
    }

    list.push(
      {
        id: 'toggle-group',
        label: grouped ? 'Show as a flat list' : 'Group by status',
        group: 'View',
        icon: grouped ? 'list' : 'layers',
        run: () => setGrouped((current) => !current),
      },
      {
        id: 'toggle-theme',
        label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
        group: 'View',
        icon: theme === 'dark' ? 'sun' : 'moon',
        keywords: 'dark light appearance',
        run: toggleTheme,
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        group: 'View',
        icon: 'keyboard',
        hint: '?',
        run: () => setShortcutsOpen(true),
      },
      {
        id: 'sign-out',
        label: 'Sign out',
        group: 'Account',
        icon: 'signOut',
        run: signOut,
      },
    );

    // Jumping straight to a request is the most-used palette action in tools like
    // this, so the loaded rows are registered as commands too.
    for (const request of requests) {
      list.push({
        id: `open-${request.id}`,
        label: request.title,
        group: 'Requests',
        icon: 'inbox',
        hint: request.clientName,
        keywords: `${request.clientName} ${request.status}`,
        run: () => {
          setSelectedId(request.id);
          setDrawerId(request.id);
        },
      });
    }

    return list;
  }, [selected, requests, grouped, theme, toggleTheme, signOut, advance, changeFilter]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <nav className="rail" aria-label="Queue">
        <div className="rail__brand">
          <span className="rail__logo" aria-hidden="true">
            CR
          </span>
          <span className="rail__mark">Requests</span>
        </div>

        <button type="button" className="rail__command" onClick={() => setPaletteOpen(true)}>
          <Icon name="search" size={14} />
          <span className="rail__command-label">Search…</span>
          <Kbd>{MOD_KEY}</Kbd>
          <Kbd>K</Kbd>
        </button>

        <div className="rail__section">
          <p className="rail__section-label" id="rail-queue">
            Queue
          </p>
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className="rail__link"
              aria-current={status === filter.value ? 'true' : undefined}
              onClick={() => changeFilter(filter.value)}
            >
              <span className="rail__link-label">{filter.label}</span>
              {stats ? (
                <span className="rail__count">
                  {filter.value === 'all' ? stats.total : stats[filter.value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="rail__footer">
          <div className="rail__user">
            <span className="rail__avatar" aria-hidden="true">
              {user?.email.slice(0, 1).toUpperCase() ?? '?'}
            </span>
            <span className="rail__user-email">{user?.email}</span>
            <ThemeToggle />
            <button
              type="button"
              className="icon-btn"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <Icon name="signOut" size={15} />
            </button>
          </div>
        </div>
      </nav>

      <main className="main" id="main">
        <div className="topbar">
          <h1 className="topbar__title">Client requests</h1>
          {pagination ? <span className="topbar__count">{pagination.total}</span> : null}

          <div className="topbar__spacer" />

          <div className="topbar__search">
            <span className="topbar__search-icon">
              <Icon name="search" size={14} />
            </span>
            <label className="visually-hidden" htmlFor="request-search">
              Search requests by title or client
            </label>
            <input
              ref={searchRef}
              id="request-search"
              className="input"
              type="search"
              placeholder="Search…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <span className="topbar__search-hint">
              <Kbd>/</Kbd>
            </span>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
          >
            <Icon name="keyboard" size={15} />
          </button>

          <Button
            variant="primary"
            size="sm"
            leading={<Icon name="plus" size={14} />}
            onClick={() => setDialogOpen(true)}
          >
            New request
          </Button>
        </div>

        <div className="content">
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Filter by status">
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className="segmented__option"
                  aria-pressed={status === filter.value}
                  onClick={() => changeFilter(filter.value)}
                >
                  {filter.label}
                  {stats ? (
                    <span className="segmented__badge">
                      {filter.value === 'all' ? stats.total : stats[filter.value]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="topbar__spacer" />

            <Button
              size="sm"
              variant="ghost"
              leading={<Icon name={grouped ? 'list' : 'layers'} size={14} />}
              onClick={() => setGrouped((current) => !current)}
            >
              {grouped ? 'Flat list' : 'Group by status'}
            </Button>
          </div>

          {/* Loading, error, empty and populated are four distinct states — each
              gets its own branch rather than one spinner standing in for all. */}
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
                selectedId={selectedId}
                pendingId={pendingId}
                flashId={flashId}
                grouped={grouped}
                collapsedGroups={collapsedGroups}
                onSelect={(request) => setSelectedId(request.id)}
                onOpen={(request) => {
                  setSelectedId(request.id);
                  setDrawerId(request.id);
                }}
                onAdvance={advance}
                onToggleGroup={toggleGroup}
              />

              {pagination && pagination.totalPages > 1 ? (
                <div className="pagination">
                  <p className="pagination__summary" aria-live="polite">
                    Page {pagination.page} of {pagination.totalPages} · {pagination.total} request
                    {pagination.total === 1 ? '' : 's'}
                  </p>

                  <div className="pagination__controls">
                    <Button
                      size="sm"
                      leading={<Icon name="chevronLeft" size={13} />}
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
        </div>
      </main>

      <NewRequestDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <RequestDrawer
        request={drawerRequest}
        isPending={drawerRequest?.id === pendingId}
        onClose={() => setDrawerId(null)}
        onAdvance={advance}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
