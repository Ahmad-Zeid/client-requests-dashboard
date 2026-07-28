import type { ClientRequest } from '../types/request';

/**
 * Relative by default, so local development goes through the Vite proxy and needs no
 * env file at all. A deployment where the API lives on another origin sets
 * `VITE_API_BASE_URL` at build time.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

const TOKEN_STORAGE_KEY = 'client-requests.token';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** A 409 carries the live row so the UI can reconcile without another fetch. */
  get conflictingRow(): ClientRequest | null {
    if (this.code !== 'VERSION_CONFLICT') return null;
    const details = this.details as { current?: ClientRequest } | undefined;
    return details?.current ?? null;
  }
}

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_STORAGE_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_STORAGE_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_STORAGE_KEY),
};

/* ── Request log ──────────────────────────────────────────────────────────── */

export type LoggedCall = {
  id: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  /** The server's request id, echoed back in the `x-request-id` header. */
  requestId: string | null;
  at: number;
};

type LogListener = (calls: LoggedCall[]) => void;

const MAX_LOGGED = 40;
let log: LoggedCall[] = [];
let nextLogId = 0;
const listeners = new Set<LogListener>();

/**
 * Every call the app makes, kept in a small ring buffer.
 *
 * This exists so the data flow is *watchable* rather than described — you can open
 * the panel, click something, and see the PATCH, its status, its duration and the
 * request id that ties it to a server log line. It is the same information the
 * network tab holds, surfaced where someone evaluating the app will actually look.
 */
export function subscribeToRequestLog(listener: LogListener): () => void {
  listeners.add(listener);
  listener(log);
  return () => listeners.delete(listener);
}

export function clearRequestLog(): void {
  log = [];
  listeners.forEach((listener) => listener(log));
}

function record(entry: Omit<LoggedCall, 'id' | 'at'>): void {
  log = [{ ...entry, id: nextLogId++, at: Date.now() }, ...log].slice(0, MAX_LOGGED);
  listeners.forEach((listener) => listener(log));
}

/* ── The client ───────────────────────────────────────────────────────────── */

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Skips the request log — used by polling or background calls that would flood it. */
  silent?: boolean;
};

/**
 * One place where HTTP happens.
 *
 * Attaches the bearer token, normalises errors, drops the session when the server
 * says the token is no longer good, and records the call. Components never call
 * `fetch`, so there is exactly one file to change to add retries or tracing.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, silent = false } = options;
  const token = tokenStorage.get();
  const startedAt = performance.now();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    signal,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!silent) {
    record({
      method,
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      requestId: response.headers.get('x-request-id'),
    });
  }

  if (response.ok) {
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  let code = 'UNKNOWN';
  let message = `Request failed with status ${response.status}.`;
  let details: unknown;

  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    code = payload.error?.code ?? code;
    message = payload.error?.message ?? message;
    details = payload.error?.details;
  } catch {
    // A non-JSON error body (a proxy 502, say) keeps the generic message above.
  }

  // An expired or tampered token can't be recovered from — clear it so the app
  // routes back to sign-in instead of retrying a request that will never succeed.
  if (response.status === 401) {
    tokenStorage.clear();
  }

  throw new ApiClientError(response.status, code, message, details);
}
