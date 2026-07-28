import type { ClientRequest } from '../types/request';

const BASE_URL = '/api/v1';
const TOKEN_STORAGE_KEY = 'client-requests.token';

/**
 * Every non-2xx response becomes one of these, so callers branch on a stable
 * `code` rather than parsing messages or checking status numbers in three places.
 */
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

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

/**
 * One place where HTTP happens.
 *
 * Attaches the bearer token, normalises errors, and drops the session when the
 * server says the token is no longer good. Components never call `fetch`, so
 * there is exactly one file to change to add retries, tracing, or a base URL.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const token = tokenStorage.get();

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

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
