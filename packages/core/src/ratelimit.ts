import { rateLimited } from "./errors";
import { getEnv } from "./env";
import { query } from "./db";

/**
 * Fixed-window counters stored in PostgreSQL so limits hold across every
 * instance (web, fallback, workers) without requiring Redis. One upsert per
 * request is cheap and index-backed; the cleanup job prunes old windows.
 */
export interface RateLimitResult {
  remaining: number;
  resetAt: Date;
}

export async function consumeRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (getEnv().RATE_LIMIT_DISABLED) return { remaining: limit, resetAt: new Date() };

  const result = await query<{ hits: number; window_start: Date }>(
    `insert into rate_limit_counters (bucket, window_start, hits)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     on conflict (bucket, window_start)
     do update set hits = rate_limit_counters.hits + 1
     returning hits, window_start`,
    [bucket, windowSeconds],
  );
  const row = result.rows[0]!;
  const resetAt = new Date(row.window_start.getTime() + windowSeconds * 1000);
  if (row.hits > limit) {
    const retry = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
    const error = rateLimited();
    (error as { detail?: unknown }).detail = { retryAfterSeconds: retry };
    throw error;
  }
  return { remaining: Math.max(0, limit - row.hits), resetAt };
}

export async function pruneRateLimits(): Promise<number> {
  const result = await query(
    "delete from rate_limit_counters where window_start < now() - interval '1 day'",
  );
  return result.rowCount ?? 0;
}
