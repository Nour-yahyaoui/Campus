import { SESSION_COOKIE } from "@campussphere/contracts";
import {
  consumeRateLimit,
  correlationIdFrom,
  errorResponse,
  hashToken,
  jsonResponse,
  recordRequestMetric,
  resolveSession,
  unavailable,
  type Me,
} from "@campussphere/core";

export interface ApiContext {
  correlationId: string;
  route: string;
  method: string;
}

/**
 * Read-only fallback wrapper: consistent envelope, correlation id, metrics and
 * safe error mapping. It never performs mutations.
 */
export async function withRead(
  request: Request,
  route: string,
  handler: (context: ApiContext) => Promise<Response>,
): Promise<Response> {
  const started = performance.now();
  const context: ApiContext = {
    correlationId: correlationIdFrom(request),
    route,
    method: request.method.toUpperCase(),
  };
  let response: Response;
  try {
    // Per-instance protection is still per-client: buckets are keyed by the
    // hashed forwarded IP and the route, never by raw address.
    await consumeRateLimit(`fallback:${ipHashFrom(request)}:${route}`, 120, 60);
    response = await handler(context);
  } catch (error) {
    const { status, body } = errorResponse(error, context.correlationId);
    response = jsonResponse(body, status, { "x-correlation-id": context.correlationId });
  }
  response.headers.set("x-correlation-id", context.correlationId);
  response.headers.set("x-fallback-service", "campussphere-next-fallback");
  void recordRequestMetric({
    route,
    method: context.method,
    statusCode: response.status,
    durationMs: performance.now() - started,
  });
  return response;
}

export function readOnlyResponse(_route: string, correlationId: string): Response {
  const { status, body } = errorResponse(
    unavailable("This fallback API is read-only. Mutations must go to the primary API; nothing was changed."),
    correlationId,
  );
  return jsonResponse(body, status, { "x-correlation-id": correlationId });
}

function ipHashFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return hashToken(ip).slice(0, 24);
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  return cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
}

export async function currentUser(request: Request): Promise<Me | null> {
  const token = sessionToken(request);
  if (!token) return null;
  return resolveSession(token);
}

export function methodNotAllowed(allowed: string[]): Response {
  return jsonResponse(
    { error: { code: "invalid_request", message: `Method not allowed. Use ${allowed.join(", ")}.` } },
    405,
    { allow: allowed.join(", ") },
  );
}
