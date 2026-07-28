import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Kbd } from '../../components/Kbd';
import { RequestLog } from '../../components/RequestLog';
import { ShortcutsDialog } from '../../components/ShortcutsDialog';
import { StateBlock } from '../../components/StateBlock';
import { useToast } from '../../components/ToastProvider';
import { MOD_KEY, useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { ApiClientError, apiRequest } from '../../lib/apiClient';
import {
  NEXT_STATUS,
  STATUS_LABELS,
  type ClientRequest,
  type RequestStatus,
} from '../../types/request';
import { useAuth } from '../auth/AuthContext';
import { CommandPalette } from '../command/CommandPalette';
import type { Command } from '../command/commands';
import { useEventStream } from '../events/useEventStream';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useTheme } from '../theme/ThemeProvider';
import { NewRequestDialog } from './NewRequestDialog';
import { RequestDetail, RequestDetailEmpty } from './RequestDetail';
import { RequestList, RequestListSkeleton } from './RequestList';
import {
  useAdvanceStatus,
  useRequestStats,
  useRequestsQuery,
  type RequestFilters,
} from './useRequests';

const PAGE_SIZE = 50;

type FilterValue = RequestStatus | 'all' | 'attention';

const FILTERS: ReadonlyArray<{ value: FilterValue; label: string; key: string }> = [
  { value: 'all', label: 'All', key: '1' },
  { value: 'new', label: STATUS_LABELS.new, key: '2' },
  { value: 'in_progress', label: STATUS_LABELS.in_progress, key: '3' },
  { value: 'done', label: STATUS_LABELS.done, key: '4' },
];

type Pane = 'list' | 'detail';

export function RequestsPage() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { notify } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  const [filter, setFilter] = useState<FilterValue>('all');
  /** The second axis: status is *what* stage, client is *whose* work. Independent. */
  const [client, setClient] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<RequestStatus>>(new Set());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedPane, setFocusedPane] = useState<Pane>('list');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  /**
   * Rows whose live updates are deliberately dropped, so the client goes genuinely
   * stale. A ref rather than state because the stream callback closes over it and
   * must see the current value without re-subscribing.
   */
  const suppressedIds = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // The server tells the client whether the demo controls exist at all, rather than
  // the build guessing which environment it is running in.
  useEffect(() => {
    apiRequest<{ features?: { demoMode?: boolean } }>('/health', { silent: true })
      .then((health) => setDemoMode(Boolean(health.features?.demoMode)))
      .catch(() => setDemoMode(false));
  }, []);

  const filters: RequestFilters = useMemo(
    () => ({
      status: filter === 'attention' || filter === 'all' ? 'all' : filter,
      attention: filter === 'attention',
      client,
      q: search,
      page: 1,
      pageSize: PAGE_SIZE,
    }),
    [filter, client, search],
  );

  const requestsQuery = useRequestsQuery(filters);
  const statsQuery = useRequestStats();
  const advanceStatus = useAdvanceStatus(filters);

  const requests = useMemo(() => requestsQuery.data?.data ?? [], [requestsQuery.data]);
  const stats = statsQuery.data;
  const pendingId = advanceStatus.isPending ? (advanceStatus.variables?.id ?? null) : null;
  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const isFiltered = filter !== 'all' || client !== null || search.trim().length > 0;

  const flash = useCallback((id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((current) => (current === id ? null : current)), 600);
  }, []);

  const streamStatus = useEventStream({
    enabled: true,
    suppressedIds,
    onRemoteUpdate: (request) => flash(request.id),
  });

  /**
   * Keep the selection pointing at something that is actually in the list.
   *
   * The condition is "is the selected row still here", not "is anything selected".
   * Those differ in the case that matters: switching filters keeps the previous page
   * on screen while the next one loads, so a naive re-select grabs a row from the old
   * list, and the moment the new data lands that id matches nothing — an empty detail
   * pane with a full queue beside it, and no state change left to fix it.
   *
   * It also gives advancing-while-filtered the right behaviour for a queue: mark the
   * last New request done and you land on the next one, rather than on nothing.
   *
   * Where it lands is a product decision. The obvious default is the top row, which is
   * the most recently logged request — the one thing here nobody needs to look at yet.
   * A triage tool should open on what has been waiting.
   */
  useEffect(() => {
    // `keepPreviousData` leaves the old page on screen while a new filter loads. Acting
    // on it would judge the selection against a list that is about to be replaced.
    if (requestsQuery.isPlaceholderData || requests.length === 0) return;
    if (selectedId && requests.some((request) => request.id === selectedId)) return;

    const first = requests.find((request) => request.attention) ?? requests[0];
    if (first) setSelectedId(first.id);
  }, [requests, selectedId, requestsQuery.isPlaceholderData]);

  /**
   * Open a request that may not be in the current view — a sibling from the detail
   * pane's client list. Widening first is what makes the jump land: selecting a row
   * the queue is not showing would leave the pane empty until the effect above bounced
   * the selection somewhere else entirely.
   */
  const openRequest = useCallback(
    (id: string) => {
      if (!requests.some((request) => request.id === id)) {
        setFilter('all');
        setClient(null);
        setSearchInput('');
      }
      setSelectedId(id);
    },
    [requests],
  );

  const advance = useCallback(
    (request: ClientRequest) => {
      const next = NEXT_STATUS[request.status];
      if (!next) return;

      flash(request.id);
      advanceStatus.mutate({
        id: request.id,
        status: next,
        // The version this decision was based on. If the row has moved on since, the
        // server rejects the write instead of silently overwriting.
        expectedVersion: request.version,
      });
    },
    [advanceStatus, flash],
  );

  // Neither of these clears the selection. If the request you were reading survives the
  // new filter, you keep reading it; if it does not, the effect above moves you on.
  const changeFilter = useCallback((value: FilterValue) => setFilter(value), []);

  /** Clicking the client you are already scoped to clears the scope, rather than doing nothing. */
  const changeClient = useCallback(
    (name: string | null) => setClient((current) => (current === name ? null : name)),
    [],
  );

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
      if (next) setSelectedId(next.id);
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

  /* ── Demonstration ─────────────────────────────────────────────────────────
     Both of these perform a genuine second-session write against the public API.
     Nothing about the server's behaviour is faked; the only difference between
     them is whether this client is allowed to hear about it. */

  const simulateColleague = useCallback(
    async (request: ClientRequest) => {
      const next = NEXT_STATUS[request.status];
      if (!next) {
        notify({
          tone: 'error',
          title: 'Nothing to simulate',
          message: 'This request is already closed, so a colleague could not advance it either.',
        });
        return;
      }

      try {
        await apiRequest(`/requests/${request.id}/status`, {
          method: 'PATCH',
          body: { status: next, expectedVersion: request.version },
        });
        // No cache write here on purpose — the update arrives over the stream,
        // exactly as it would if the change had come from another person.
      } catch (error) {
        notify({
          tone: 'error',
          title: 'Simulation failed',
          message: error instanceof ApiClientError ? error.message : 'Could not reach the server.',
        });
      }
    },
    [notify],
  );

  const simulateConflict = useCallback(
    async (request: ClientRequest) => {
      const next = NEXT_STATUS[request.status];
      if (!next) {
        notify({
          tone: 'error',
          title: 'Nothing to conflict with',
          message: 'Pick a request that is not already closed.',
        });
        return;
      }

      // Withhold the live update for this one row. The client is now holding a
      // version the server has moved past — which is precisely the state a tab left
      // open in the background is in.
      suppressedIds.current.add(request.id);

      try {
        await apiRequest(`/requests/${request.id}/status`, {
          method: 'PATCH',
          body: { status: next, expectedVersion: request.version },
        });

        notify({
          tone: 'conflict',
          title: 'This view is now stale',
          message: `Another session moved it to ${STATUS_LABELS[next]}. Press E to try the change you were about to make.`,
        });
      } catch (error) {
        suppressedIds.current.delete(request.id);
        notify({
          tone: 'error',
          title: 'Simulation failed',
          message: error instanceof ApiClientError ? error.message : 'Could not reach the server.',
        });
      }
    },
    [notify],
  );

  // Once the conflict has been demonstrated, stop withholding updates for that row.
  useEffect(() => {
    if (!advanceStatus.isError) return;
    const id = advanceStatus.variables?.id;
    if (id) suppressedIds.current.delete(id);
  }, [advanceStatus.isError, advanceStatus.variables]);

  const resetDemo = useCallback(async () => {
    try {
      await apiRequest('/demo/reset', { method: 'POST' });
      setSelectedId(null);
      suppressedIds.current.clear();
    } catch (error) {
      notify({
        tone: 'error',
        title: 'Could not reset',
        message: error instanceof ApiClientError ? error.message : 'Could not reach the server.',
      });
    }
  }, [notify]);

  const anyOverlayOpen = paletteOpen || dialogOpen || shortcutsOpen || mobileDetailOpen;

  useKeyboardShortcuts(
    [
      { key: 'k', meta: true, allowWhileTyping: true, run: () => setPaletteOpen((o) => !o) },
      /**
       * Escape widens the view rather than clearing the selection — the detail pane
       * re-selects the moment it is emptied, so "deselect" was a keystroke with no
       * visible effect. One step out at a time: drop the search text first, then the
       * filters, so it is never a single key that throws away two decisions.
       */
      {
        key: 'escape',
        allowWhileTyping: true,
        run: () => {
          if (searchInput) {
            setSearchInput('');
            return;
          }
          setFilter('all');
          setClient(null);
        },
      },
      { key: '/', run: () => searchRef.current?.focus() },
      { key: 'c', run: () => setDialogOpen(true) },
      { key: '?', run: () => setShortcutsOpen(true) },

      // Vertical through the list, horizontal between panes — the vim spatial model.
      // It only makes sense because there *are* panes to move between.
      { key: 'j', run: () => moveSelection(1) },
      { key: 'k', run: () => moveSelection(-1) },
      { key: 'arrowdown', run: () => moveSelection(1) },
      { key: 'arrowup', run: () => moveSelection(-1) },
      { key: 'h', run: () => setFocusedPane('list') },
      {
        key: 'l',
        run: () => {
          setFocusedPane('detail');
          detailRef.current?.focus();
        },
      },

      { key: 'enter', run: () => selected && setMobileDetailOpen(true) },
      { key: 'e', run: () => selected && advance(selected) },
      { key: 'g', run: () => setLogOpen((open) => !open) },

      ...FILTERS.map((entry) => ({
        key: entry.key,
        run: () => changeFilter(entry.value),
      })),
      { key: '5', run: () => changeFilter('attention') },
    ],
    !anyOverlayOpen,
  );

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      {
        id: 'new-request',
        label: 'New request',
        group: 'Actions',
        icon: 'plus',
        hint: 'C',
        keywords: 'create add log',
        weight: 1.2,
        run: () => setDialogOpen(true),
      },
    ];

    if (selected) {
      const next = NEXT_STATUS[selected.status];
      if (next) {
        list.push({
          id: 'advance-selected',
          label: `Advance to ${STATUS_LABELS[next]}`,
          group: 'Actions',
          icon: 'arrowRight',
          hint: 'E',
          keywords: 'status move start done progress',
          weight: 1.2,
          run: () => advance(selected),
        });
      }

      list.push(
        {
          id: 'demo-colleague',
          label: 'Simulate a colleague updating this request',
          group: 'Demonstrate',
          icon: 'users',
          keywords: 'live sync realtime sse push another session',
          run: () => void simulateColleague(selected),
        },
        {
          id: 'demo-conflict',
          label: 'Simulate a stale conflict on this request',
          group: 'Demonstrate',
          icon: 'alert',
          keywords: 'version 409 concurrency lost update race',
          run: () => void simulateConflict(selected),
        },
      );
    }

    list.push({
      id: 'toggle-log',
      label: logOpen ? 'Hide the request log' : 'Show the request log',
      group: 'Demonstrate',
      icon: 'activity',
      hint: 'G',
      keywords: 'network api calls devtools data flow',
      run: () => setLogOpen((open) => !open),
    });

    if (demoMode) {
      list.push({
        id: 'demo-reset',
        label: 'Reset the demo data',
        group: 'Demonstrate',
        icon: 'refresh',
        keywords: 'seed restore sample',
        run: () => void resetDemo(),
      });
    }

    for (const entry of FILTERS) {
      list.push({
        id: `filter-${entry.value}`,
        label: `Show ${entry.label.toLowerCase()}`,
        group: 'Filter',
        icon: 'filter',
        hint: entry.key,
        keywords: 'status view',
        run: () => changeFilter(entry.value),
      });
    }

    list.push(
      {
        id: 'filter-attention',
        label: 'Show what needs attention',
        group: 'Filter',
        icon: 'alert',
        hint: '5',
        keywords: 'overdue stale aging waiting urgent',
        run: () => changeFilter('attention'),
      },
      {
        id: 'filter-client-clear',
        label: 'Show every client',
        group: 'Filter',
        icon: 'users',
        keywords: 'all clear reset scope',
        run: () => changeClient(null),
      },
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
      { id: 'sign-out', label: 'Sign out', group: 'Account', icon: 'signOut', run: signOut },
    );

    for (const entry of stats?.clients ?? []) {
      list.push({
        id: `client-${entry.name}`,
        label: entry.name,
        group: 'Clients',
        icon: 'users',
        hint: `${entry.open} open`,
        keywords: 'client account customer',
        weight: 0.95,
        run: () => changeClient(entry.name),
      });
    }

    for (const request of requests) {
      list.push({
        id: `open-${request.id}`,
        label: request.title,
        group: 'Requests',
        icon: 'inbox',
        hint: request.clientName,
        keywords: `${request.clientName} ${request.status}`,
        weight: 0.9,
        run: () => setSelectedId(request.id),
      });
    }

    return list;
  }, [
    selected, requests, stats, grouped, theme, logOpen, demoMode,
    toggleTheme, signOut, advance, changeFilter, changeClient,
    simulateColleague, simulateConflict, resetDemo,
  ]);

  const activeFilterLabel =
    filter === 'attention' ? 'Needs attention' : FILTERS.find((f) => f.value === filter)?.label;

  return (
    <div className="cockpit">
      <a className="skip-link" href="#queue">
        Skip to the queue
      </a>

      {/* ── Rail ── */}
      <nav className="rail" aria-label="Queue">
        <div className="rail__brand">
          <span className="rail__logo" aria-hidden="true">
            CR
          </span>
          <span className="rail__mark">Requests</span>
        </div>

        {/* A command trigger, not a second search box. The queue's own filter lives in
            the queue header where the thing it filters is; putting a lookalike here
            would only make people guess which one they were typing into. */}
        <button type="button" className="rail__command" onClick={() => setPaletteOpen(true)}>
          <Icon name="command" size={13} />
          <span className="rail__command-label">Commands</span>
          <span className="rail__command-keys">
            <Kbd>{MOD_KEY}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <div className="rail__section">
          <p className="rail__section-label">Queue</p>
          {FILTERS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className="rail__link"
              aria-current={filter === entry.value ? 'true' : undefined}
              onClick={() => changeFilter(entry.value)}
            >
              <span className="rail__link-label">{entry.label}</span>
              {stats ? (
                <span className="rail__count">
                  {entry.value === 'all' ? stats.total : stats[entry.value as RequestStatus]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* The product's opinion, stated as a sentence rather than a stat card.
            Everyone ships stat cards; nobody reads them. */}
        {stats && stats.needsAttention > 0 ? (
          <button
            type="button"
            className="rail__attention"
            aria-current={filter === 'attention' ? 'true' : undefined}
            onClick={() => changeFilter('attention')}
          >
            <Icon name="alert" size={14} />
            <span>
              <strong>{stats.needsAttention}</strong>{' '}
              {stats.needsAttention === 1 ? 'request has' : 'requests have'} gone quiet
            </span>
          </button>
        ) : null}

        {/* The second axis. An agency's queue is not one pile — it is several clients'
            piles that happen to share a team, and "what does Marina Pharmacy have open"
            is a question people ask out loud every day. Counts are open work, not totals:
            a client with nothing outstanding needs nothing from you. */}
        {stats && stats.clients.length > 0 ? (
          <div className="rail__section rail__section--scroll">
            <p className="rail__section-label">
              Clients
              {client ? (
                <button type="button" className="rail__clear" onClick={() => changeClient(null)}>
                  Clear
                </button>
              ) : null}
            </p>

            {stats.clients.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className="rail__link"
                aria-current={client === entry.name ? 'true' : undefined}
                onClick={() => changeClient(entry.name)}
                title={`${entry.open} open of ${entry.total}`}
              >
                <span className="rail__link-label">{entry.name}</span>
                <span className="rail__count" data-quiet={entry.open === 0 || undefined}>
                  {entry.open}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="rail__footer">
          <div className="rail__stream" data-status={streamStatus}>
            <span className="rail__stream-dot" aria-hidden="true" />
            {streamStatus === 'live'
              ? 'Live'
              : streamStatus === 'connecting'
                ? 'Connecting…'
                : 'Reconnecting…'}
          </div>

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

      {/* ── Queue ── */}
      <section
        className="queue"
        id="queue"
        aria-label="Request queue"
        data-focused={focusedPane === 'list' || undefined}
        onFocusCapture={() => setFocusedPane('list')}
      >
        <header className="queue__head">
          <div className="queue__search">
            <span className="queue__search-icon">
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
            <span className="queue__search-hint">
              <Kbd>/</Kbd>
            </span>
          </div>

          <div className="queue__meta">
            <span className="queue__count">
              {activeFilterLabel}
              {client ? <span className="queue__scope"> · {client}</span> : null} ·{' '}
              {requests.length}
            </span>
            <button
              type="button"
              className="queue__group-toggle"
              onClick={() => setGrouped((current) => !current)}
              title={grouped ? 'Show as a flat list' : 'Group by status'}
            >
              <Icon name={grouped ? 'list' : 'layers'} size={13} />
              {grouped ? 'Flat' : 'Group'}
            </button>
          </div>
        </header>

        <div className="queue__scroll">
          {requestsQuery.isPending ? (
            <RequestListSkeleton />
          ) : requestsQuery.isError ? (
            <StateBlock
              icon="alert"
              tone="error"
              title="Could not load the queue"
              body="The API did not respond. Check that the server is running on port 4000."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  state={requestsQuery.isFetching ? 'loading' : 'idle'}
                  loadingLabel="Retrying…"
                  onClick={() => void requestsQuery.refetch()}
                >
                  Try again
                </Button>
              }
            />
          ) : requests.length === 0 ? (
            <StateBlock
              icon="inbox"
              title={isFiltered ? 'Nothing here' : 'The queue is empty'}
              body={
                isFiltered
                  ? 'No request matches this view.'
                  : 'Nothing has been logged yet. The first request will show up here.'
              }
              action={
                isFiltered ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setFilter('all');
                      setClient(null);
                      setSearchInput('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    leading={<Icon name="plus" size={14} />}
                    onClick={() => setDialogOpen(true)}
                  >
                    Log the first request
                  </Button>
                )
              }
            />
          ) : (
            <RequestList
              requests={requests}
              selectedId={selectedId}
              pendingId={pendingId}
              flashId={flashId}
              grouped={grouped}
              collapsedGroups={collapsedGroups}
              onSelect={(request) => {
                setSelectedId(request.id);
                setFocusedPane('list');
              }}
              onToggleGroup={toggleGroup}
            />
          )}
        </div>

        <footer className="queue__foot">
          <Button
            variant="primary"
            size="sm"
            block
            leading={<Icon name="plus" size={14} />}
            onClick={() => setDialogOpen(true)}
          >
            New request
            <Kbd>C</Kbd>
          </Button>
        </footer>
      </section>

      {/* ── Detail ── */}
      <main
        className="detail"
        ref={detailRef}
        tabIndex={-1}
        aria-label="Request detail"
        data-focused={focusedPane === 'detail' || undefined}
        onFocusCapture={() => setFocusedPane('detail')}
      >
        {selected ? (
          <RequestDetail
            request={selected}
            isPending={selected.id === pendingId}
            onAdvance={advance}
            onSelect={openRequest}
          />
        ) : (
          <RequestDetailEmpty />
        )}
      </main>

      <RequestLog open={logOpen} onClose={() => setLogOpen(false)} />

      {/* Below 1100px the detail pane becomes an overlay instead of a column. Its body
          is mounted only while open — the pane below renders the same component, and
          two copies in the DOM would mean two elements sharing one heading id. */}
      <dialog
        className="detail-overlay"
        open={mobileDetailOpen && selected !== null}
        aria-label="Request detail"
      >
        {mobileDetailOpen && selected ? (
          <RequestDetail
            request={selected}
            isPending={selected.id === pendingId}
            onAdvance={advance}
            onClose={() => setMobileDetailOpen(false)}
          />
        ) : null}
      </dialog>

      <NewRequestDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
