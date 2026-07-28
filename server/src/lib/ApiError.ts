/**
 * Every error the API returns on purpose is an ApiError.
 *
 * The `code` is a stable, machine-readable string — clients branch on it, and it
 * never changes even if the human-readable `message` is reworded. Anything thrown
 * that is *not* an ApiError is treated as a bug and becomes a generic 500, so an
 * unexpected stack trace can never leak to a caller.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'VERSION_CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static invalidCredentials(message = 'That email and password combination is not recognised.') {
    return new ApiError(401, 'INVALID_CREDENTIALS', message);
  }

  static notFound(message = 'Resource not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  /**
   * 422 rather than 400: the payload is well-formed and passed validation, but the
   * requested transition is not legal from the resource's current state.
   */
  static invalidTransition(message: string, details?: unknown) {
    return new ApiError(422, 'INVALID_TRANSITION', message, details);
  }

  /**
   * 409: someone else modified the row since the client last read it. The current
   * row travels in `details` so the client can reconcile without a second request.
   */
  static versionConflict(message: string, details?: unknown) {
    return new ApiError(409, 'VERSION_CONFLICT', message, details);
  }
}
