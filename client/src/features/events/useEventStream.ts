import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { API_BASE_URL, apiRequest } from '../../lib/apiClient';
import type { ClientRequest, PaginatedRequests } from '../../types/request';
import { requestKeys } from '../requests/useRequests';

export type StreamStatus = 'connecting' | 'live' | 'offline';

type StreamOptions = {
  enabled: boolean;
  /**
   * Rows whose live updates should be dropped on the floor.
   *
   * Used by the conflict demo: withholding the refresh for one row is what makes
   * this client genuinely stale, which is the only honest way to show a real 409.
   */
  suppressedIds?: React.RefObject<Set<string>>;
  onRemoteUpdate?: (request: ClientRequest) => void;
};

/**
 * Live updates over Server-Sent Events.
 *
 * SSE rather than WebSockets because the traffic is entirely one-directional —
 * the server tells the client what changed, and the client already has a perfectly
 * good REST API for writing. A WebSocket would add a second protocol, its own
 * reconnect and heartbeat handling, and a framing format, to buy a direction we
 * never use.
 */
export function useEventStream({ enabled, suppressedIds, onRemoteUpdate }: StreamOptions) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const sourceRef = useRef<EventSource | null>(null);
  const callbackRef = useRef(onRemoteUpdate);
  callbackRef.current = onRemoteUpdate;

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      return;
    }

    let cancelled = false;
    let retryTimer: number | undefined;
    let attempt = 0;

    async function connect() {
      if (cancelled) return;
      setStatus(attempt === 0 ? 'connecting' : 'offline');

      let ticket: string;
      try {
        // EventSource cannot send an Authorization header, so the bearer token is
        // exchanged for a single-use, 30-second ticket rather than being pasted into
        // a URL that ends up in every access log.
        const response = await apiRequest<{ data: { ticket: string } }>('/events/ticket', {
          method: 'POST',
          silent: true,
        });
        ticket = response.data.ticket;
      } catch {
        scheduleRetry();
        return;
      }

      if (cancelled) return;

      const source = new EventSource(
        `${API_BASE_URL}/events?ticket=${encodeURIComponent(ticket)}`,
      );
      sourceRef.current = source;

      source.addEventListener('ready', () => {
        attempt = 0;
        setStatus('live');
      });

      source.addEventListener('request.updated', (event) => {
        const request = JSON.parse((event as MessageEvent).data) as ClientRequest;
        if (suppressedIds?.current?.has(request.id)) return;

        patchCachedRow(request);
        callbackRef.current?.(request);
      });

      source.addEventListener('request.created', () => {
        // A new row shifts ordering, counts and page boundaries, so guessing where it
        // lands in the current sort would be wrong more often than not.
        void queryClient.invalidateQueries({ queryKey: requestKeys.all });
      });

      source.onerror = () => {
        // EventSource retries on its own, but only for transient network faults —
        // it gives up permanently once the server responds 4xx, which is exactly what
        // happens when a ticket expires. Reconnecting means minting a fresh one.
        source.close();
        sourceRef.current = null;
        scheduleRetry();
      };
    }

    function scheduleRetry() {
      if (cancelled) return;
      setStatus('offline');
      attempt += 1;
      // Backoff, capped — a server that is down should not be hammered, and a user
      // watching an idle tab should not wait minutes once it comes back.
      const delay = Math.min(1000 * 2 ** (attempt - 1), 15_000);
      retryTimer = window.setTimeout(connect, delay);
    }

    /** Surgical: patch the row wherever it already sits, rather than refetching everything. */
    function patchCachedRow(request: ClientRequest) {
      // Scoped to the list queries. `requestKeys.all` would also match stats and the
      // activity trails, whose payloads are a different shape entirely.
      queryClient.setQueriesData<PaginatedRequests>(
        { queryKey: [...requestKeys.all, 'list'] },
        (current) => {
          if (!current?.data) return current;
          if (!current.data.some((row) => row.id === request.id)) return current;

          return {
            ...current,
            data: current.data.map((row) => (row.id === request.id ? request : row)),
          };
        },
      );

      // The status counts live in a separate query and cannot be patched from one row.
      void queryClient.invalidateQueries({ queryKey: [...requestKeys.all, 'stats'] });

      // The change added an entry to this request's trail, and only the server knows
      // what it says — who made it, and at what time on the server's clock.
      void queryClient.invalidateQueries({
        queryKey: [...requestKeys.all, 'activity', request.id],
      });
    }

    void connect();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [enabled, queryClient, suppressedIds]);

  return status;
}
