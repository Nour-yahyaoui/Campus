import type { ApiErrorCode } from "@campussphere/contracts";

/**
 * Errors are expected to be safe to serialise to clients. `detail` is only
 * attached for validation errors that originate from user input, never for
 * database or provider failures.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly detail?: unknown;

  constructor(code: ApiErrorCode, message: string, status?: number, detail?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status ?? defaultStatus(code);
    this.detail = detail;
  }
}

function defaultStatus(code: ApiErrorCode): number {
  switch (code) {
    case "invalid_request":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "rate_limited":
      return 429;
    case "unavailable":
      return 503;
    default:
      return 500;
  }
}

export const badRequest = (message = "The request is invalid", detail?: unknown) =>
  new AppError("invalid_request", message, 400, detail);
export const unauthorized = (message = "Sign in to continue") =>
  new AppError("unauthorized", message, 401);
export const forbidden = (message = "You do not have permission to do that") =>
  new AppError("forbidden", message, 403);
export const notFound = (message = "Not found") => new AppError("not_found", message, 404);
export const conflict = (message: string) => new AppError("conflict", message, 409);
export const rateLimited = (message = "Too many requests. Try again shortly.") =>
  new AppError("rate_limited", message, 429);
export const unavailable = (message = "This feature is temporarily unavailable") =>
  new AppError("unavailable", message, 503);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Maps unknown failures to a public-safe error and logs the real cause. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  const pgCode = (error as { code?: string } | null)?.code;
  if (pgCode === "23505") return conflict("That already exists.");
  if (pgCode === "23503") return badRequest("A referenced record does not exist.");
  if (pgCode === "23514") return badRequest("A value violates a data constraint.");
  if (pgCode === "22P02") return badRequest("A value has an invalid format.");
  if (pgCode === "57014") return unavailable("The database took too long to respond.");
  // A burst on a popular event makes requests queue behind the row lock in
  // `registerForEvent`. PostgreSQL then raises lock_not_available (55P03), a
  // deadlock (40P01) or a serialization failure (40001); all three are
  // "try again", not "something went wrong".
  if (pgCode === "55P03" || pgCode === "40P01" || pgCode === "40001") {
    return unavailable("The system is busy. Please try again in a moment.");
  }
  // node-postgres enforces `query_timeout` client-side and raises a plain Error
  // with no SQLSTATE, so it would otherwise be reported as a 500.
  const message = (error as { message?: string } | null)?.message ?? "";
  if (!pgCode && /query read timeout|connection terminated due to connection timeout/i.test(message)) {
    return unavailable("The database took too long to respond.");
  }
  console.error("[error] unhandled", error);
  return new AppError("internal_error", "Something went wrong on our side.", 500);
}

export interface ErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown; correlationId?: string };
}

export function errorResponse(error: unknown, correlationId?: string): { status: number; body: ErrorBody } {
  const app = toAppError(error);
  return {
    status: app.status,
    body: {
      error: {
        code: app.code,
        message: app.message,
        ...(app.detail !== undefined ? { details: app.detail } : {}),
        ...(correlationId ? { correlationId } : {}),
      },
    },
  };
}
