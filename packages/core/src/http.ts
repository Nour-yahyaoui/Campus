import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { LIMITS } from "@campussphere/contracts";
import { badRequest, errorResponse, forbidden, toAppError } from "./errors";
import { getEnv } from "./env";
import { recordRequestMetric } from "./services/observatory";
import { consumeRateLimit } from "./ratelimit";
import { hashToken } from "./auth";

export interface RequestContext {
  correlationId: string;
  ip: string;
  userAgent: string | null;
  route: string;
  method: string;
}

export function correlationIdFrom(request: Request): string {
  const provided = request.headers.get("x-correlation-id");
  if (provided && /^[A-Za-z0-9_-]{8,64}$/.test(provided)) return provided;
  return randomUUID();
}

/**
 * Client IP as seen by the hosting proxy. Both Vercel and Render set
 * x-forwarded-for; we take the first entry and hash it before storage.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
  return request.headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

export function ipHash(request: Request): string {
  return hashToken(clientIp(request)).slice(0, 24);
}

/**
 * Defence in depth for cookie-authenticated mutations. Browsers send Origin on
 * fetch and form posts; a mismatch with the canonical site (or the request's
 * own host) is rejected. Server Actions additionally get Next's built-in
 * origin check.
 */
export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients (tests, curl) may omit Origin; cookie auth still
    // requires the session cookie, which scripts cannot read cross-site.
    return;
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(getEnv().NEXT_PUBLIC_SITE_URL).origin);
  } catch {
    /* invalid config is already rejected by env validation */
  }
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    /* ignore */
  }
  if (!allowed.has(origin)) throw forbidden("Cross-origin request blocked.");
}

export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  assertSameOrigin(request);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw badRequest("Expected a JSON body.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > LIMITS.requestBodyBytes) throw badRequest("The request body is too large.");
  const text = await request.text();
  if (text.length > LIMITS.requestBodyBytes) throw badRequest("The request body is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw badRequest(
      "Some fields need attention.",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

export function parseQuery<T extends z.ZodType>(url: URL, schema: T): z.infer<T> {
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw badRequest(
      "Some query parameters are invalid.",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

/**
 * Wraps an API handler: correlation id, error mapping, request metrics and
 * security headers in one place so individual routes stay small.
 */
export async function handleApi(
  request: Request,
  route: string,
  handler: (context: RequestContext) => Promise<Response>,
): Promise<Response> {
  const started = performance.now();
  const context: RequestContext = {
    correlationId: correlationIdFrom(request),
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
    route,
    method: request.method.toUpperCase(),
  };
  let response: Response;
  try {
    response = await handler(context);
  } catch (error) {
    const { status, body } = errorResponse(error, context.correlationId);
    response = jsonResponse(body, status, { "x-correlation-id": context.correlationId });
  }
  const duration = performance.now() - started;
  response.headers.set("x-correlation-id", context.correlationId);
  void recordRequestMetric({
    route,
    method: context.method,
    statusCode: response.status,
    durationMs: duration,
  });
  return response;
}

/**
 * Rate-limit helper for API routes. Buckets combine the action name with the
 * authenticated user when available, otherwise the hashed client IP.
 */
export async function enforceRateLimit(
  request: Request,
  action: string,
  limit: number,
  windowSeconds: number,
  userId?: string | null,
): Promise<void> {
  const identity = userId ? `user:${userId}` : `ip:${ipHash(request)}`;
  await consumeRateLimit(`${action}:${identity}`, limit, windowSeconds);
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
  return null;
}

/**
 * The fallback API accepts the same session cookie as the web app. Browsers
 * only send it for its own origin, so server-to-server clients use the bearer
 * form of the same opaque token.
 */
export function sessionTokenFrom(request: Request): string | null {
  return bearerToken(request);
}

export { toAppError };
