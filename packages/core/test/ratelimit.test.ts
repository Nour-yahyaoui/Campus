import { describe, expect, it } from "vitest";
import { resetDb } from "./helpers";
import { consumeRateLimit } from "../src/ratelimit";
import { query } from "../src/db";

describe("distributed rate limiting", () => {
  it("allows requests up to the limit, then rejects with a retry hint", async () => {
    await resetDb();
    for (let index = 0; index < 3; index += 1) {
      const result = await consumeRateLimit("test:login:ip", 3, 60);
      expect(result.remaining).toBe(2 - index);
    }
    await expect(consumeRateLimit("test:login:ip", 3, 60)).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
    const row = await query<{ hits: number }>("select hits from rate_limit_counters");
    expect(row.rows[0]!.hits).toBe(4);
  });
});
