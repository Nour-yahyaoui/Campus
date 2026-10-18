import "server-only";
import { getEnv } from "@campussphere/core";

/**
 * The Actix service is the primary source for public reads.
 *
 * Every function here answers the same question: "can the primary be asked
 * about this, and did it answer?" `null` always means *fall back to the local
 * database* — never a partially built page.
 *
 * Two rules keep a sleeping free-tier instance from ruining the site:
 *
 * 1. A short timeout (2 s). A page render must not wait for a cold start;
 *    the visitor gets the fallback instead, and the next render tries again.
 * 2. A circuit breaker: after a timeout or a 5xx the primary is skipped for
 *    30 s by this instance. Without it every page view would pay the timeout
 *    for as long as the service stayed down.
 */

const PRIMARY_TIMEOUT_MS = 2_000;
const PRIMARY_COOLDOWN_MS = 30_000;

let downUntil = 0;

function primaryBase(): URL | null {
  const env = getEnv();
  if (!env.API_BASE_URL) return null;
  try {
    const base = new URL(env.API_BASE_URL);
    // Pointing the primary at this deployment would be a proxy loop.
    if (base.origin === new URL(env.NEXT_PUBLIC_SITE_URL).origin) return null;
    return base;
  } catch {
    return null;
  }
}

/** Whether this deployment has a primary to read through at all. */
export function primaryConfigured(): boolean {
  return primaryBase() !== null;
}

function queryString(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function primaryJson(
  path: string,
  params: Record<string, string | number | null | undefined>,
): Promise<Record<string, unknown> | null> {
  const base = primaryBase();
  if (!base) return null;
  if (Date.now() < downUntil) return null;
  try {
    const response = await fetch(new URL(`/api/v1/${path}${queryString(params)}`, base), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(PRIMARY_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      // A 4xx is the primary answering about the request; the fallback can
      // still render the page, so it is not treated as an outage.
      if (response.status >= 500) downUntil = Date.now() + PRIMARY_COOLDOWN_MS;
      return null;
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") return null;
    return payload as Record<string, unknown>;
  } catch {
    downUntil = Date.now() + PRIMARY_COOLDOWN_MS;
    return null;
  }
}

export interface PrimaryPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * One page of a public collection. `isItem` is a cheap shape check: a service
 * running an older build must not be able to hand a page data it cannot render,
 * so anything unexpected falls back instead of half-rendering.
 */
export async function primaryList<T>(
  path: string,
  params: Record<string, string | number | null | undefined>,
  isItem: (item: unknown) => boolean,
): Promise<PrimaryPage<T> | null> {
  const payload = await primaryJson(path, params);
  if (!payload || !Array.isArray(payload.data)) return null;
  if (!payload.data.every(isItem)) return null;
  const meta = payload.meta;
  const nextCursor =
    meta && typeof meta === "object" && typeof (meta as { nextCursor?: unknown }).nextCursor === "string"
      ? (meta as { nextCursor: string }).nextCursor
      : null;
  return { items: payload.data as T[], nextCursor };
}

/** The search document, which is a single object rather than a page. */
export async function primarySearch<T>(
  term: string,
  kind: string,
  isDocument: (value: unknown) => boolean,
): Promise<T | null> {
  const payload = await primaryJson("search", { q: term, type: kind });
  if (!payload || !isDocument(payload.data)) return null;
  return payload.data as T;
}
