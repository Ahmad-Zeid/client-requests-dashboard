import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { useToast } from '../../components/ToastProvider';
import { ApiClientError, apiRequest } from '../../lib/apiClient';
import type {
  ClientRequest,
  PaginatedRequests,
  RequestPriority,
  RequestStatus,
} from '../../types/request';

export type RequestFilters = {
  status: RequestStatus | 'all';
  q: string;
  page: number;
  pageSize: number;
};

/**
 * Query keys are derived from the filters, so every distinct view of the list is
 * cached separately and switching a filter back reuses what we already fetched.
 */
export const requestKeys = {
  all: ['requests'] as const,
  list: (filters: RequestFilters) => ['requests', 'list', filters] as const,
};

function buildQueryString(filters: RequestFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  return params.toString();
}

export function useRequestsQuery(filters: RequestFilters) {
  return useQuery({
    queryKey: requestKeys.list(filters),
    queryFn: ({ signal }) =>
      apiRequest<PaginatedRequests>(`/requests?${buildQueryString(filters)}`, { signal }),

    /**
     * Keep the previous page on screen while the next one loads. Without this,
     * paging or typing in the filter blanks the table on every keystroke.
     */
    placeholderData: keepPreviousData,

    /**
     * Ten seconds. Long enough that switching filters back and forth does not
     * re-hit the API, short enough that a tab left open and returned to shows
     * current data. React Query also refetches on window focus by default, which
     * is what covers the "someone else changed it while I was away" case.
     */
    staleTime: 10_000,

    retry: (failureCount, error) => {
      // Retrying a 401 or a 422 just repeats a rejection the server already
      // considered final. Only transient failures are worth another attempt.
      if (error instanceof ApiClientError && error.status < 500) return false;
      return failureCount < 2;
    },
  });
}

export type RequestStats = Record<RequestStatus, number> & { total: number };

/**
 * Counts for the rail. Its own query rather than derived from the list, because
 * the list only ever holds one page of one filter — it cannot know how many
 * requests sit in the statuses you are not looking at.
 */
export function useRequestStats() {
  return useQuery({
    queryKey: [...requestKeys.all, 'stats'] as const,
    queryFn: ({ signal }) => apiRequest<{ data: RequestStats }>('/requests/stats', { signal }),
    select: (response) => response.data,
    staleTime: 10_000,
  });
}

export type CreateRequestInput = {
  clientName: string;
  title: string;
  description?: string;
  priority: RequestPriority;
};

export function useCreateRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRequestInput) =>
      apiRequest<{ data: ClientRequest }>('/requests', { method: 'POST', body: input }),

    onSuccess: () => {
      // A new row changes ordering, counts and page boundaries, so the honest move
      // is to refetch rather than guess where it lands in the current sort.
      void queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

type AdvanceInput = {
  id: string;
  status: RequestStatus;
  expectedVersion: number;
};

/**
 * The status change, with an optimistic update.
 *
 * The sequence matters:
 *
 *   1. onMutate  — cancel in-flight refetches (a response landing mid-mutation
 *                  would overwrite our optimistic value), snapshot the cache so
 *                  we can undo, then write the new status immediately. The row
 *                  updates on click, not on round trip.
 *   2. onError   — put the snapshot back, then explain what happened. A 409 is
 *                  handled separately: the server sends the live row with the
 *                  conflict, so we write that into the cache and the user sees
 *                  the truth instead of a stale value snapping back.
 *   3. onSettled — refetch regardless, so the cache ends up matching the server
 *                  even if our optimistic guess was subtly different.
 *
 * There is no success toast. The row already shows the new status — saying so
 * again is noise.
 */
export function useAdvanceStatus(filters: RequestFilters) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const listKey = requestKeys.list(filters);

  return useMutation({
    mutationFn: ({ id, status, expectedVersion }: AdvanceInput) =>
      apiRequest<{ data: ClientRequest }>(`/requests/${id}/status`, {
        method: 'PATCH',
        body: { status, expectedVersion },
      }),

    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: listKey });

      const previous = queryClient.getQueryData<PaginatedRequests>(listKey);

      queryClient.setQueryData<PaginatedRequests>(listKey, (current) =>
        current
          ? {
              ...current,
              data: current.data.map((row) =>
                row.id === id
                  ? { ...row, status, version: row.version + 1, updatedAt: new Date().toISOString() }
                  : row,
              ),
            }
          : current,
      );

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }

      if (error instanceof ApiClientError) {
        const live = error.conflictingRow;

        if (live) {
          // Reconcile from the row the 409 carried — no extra request needed.
          queryClient.setQueryData<PaginatedRequests>(listKey, (current) =>
            current
              ? { ...current, data: current.data.map((row) => (row.id === live.id ? live : row)) }
              : current,
          );

          notify({
            tone: 'conflict',
            title: 'Someone else got there first',
            message: 'This request was changed while you were looking at it. Showing the latest.',
          });
          return;
        }

        notify({ tone: 'error', title: 'Could not update the status', message: error.message });
        return;
      }

      notify({
        tone: 'error',
        title: 'Could not reach the server',
        message: 'The status was not changed. Check your connection and try again.',
      });
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}
