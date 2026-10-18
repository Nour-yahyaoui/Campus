# Load-test plan

**Status: the k6 plan below has not been executed.** The target is a
requirement to validate, not a claim that the platform meets it. A much
smaller local baseline was run on 2026-10-18 (see *Local baseline*), but it
does not support any statement about the 3,000-user target.

## Target

- 3,000 concurrent users at peak (the brief's figure).
- 70% browsing public pages, 20% read API calls, 10% authenticated writes
  (registration, application, comment-free flows).
- p95 page TTFB < 400 ms, p95 API read latency < 250 ms, error rate < 0.5%.
- Sustained for 30 minutes, with a 10-minute ramp.

## Environment

- Staging with production-equivalent compute and Neon plan.
- Separate database seeded with a realistic corpus: 300 clubs, 2,000 events,
  1,500 projects, 30,000 registrations, 200,000 audit rows.
- Worker running; email transport set to a sink, not a real provider.
- k6 v0.5x on a machine outside the hosting region; note the network RTT.

## Scenarios

1. **Public browse** (`load-tests/browse.js`): home, club list/detail, event
   list/detail, project list, search. Think time 2–6 s. Thresholds on
   `http_req_failed` and `http_req_duration{expected_response:true}`.
2. **API reads** (`load-tests/api.js`): `/api/v1/clubs`, `/api/v1/events`,
   `/api/v1/search`, with and without cursors.
3. **Authenticated spike** (manual, separate): 200 virtual users registering for
   a capacity-100 event with a waitlist. Assert: exactly 100 confirmed, the rest
   waitlisted, no 5xx, database deadlocks = 0.

Writes are not included in the 3,000-user run because a realistic write mix
needs real accounts and session cookies; the spike above is the correctness
test, not a throughput test.

## Method

```bash
# Public traffic, 3k VUs, 40 minutes total.
k6 run load-tests/browse.js \
  -e BASE_URL=https://staging.example.edu \
  -e RAMP_UP=10m -e HOLD=30m \
  --out json=results/browse.json

# Read API against the Rust service (and repeat against the fallback).
k6 run load-tests/api.js \
  -e API_BASE_URL=https://api-staging.example.edu \
  --out json=results/api.json
```

Run each scenario three times; report the median run and the worst run.

## Abort criteria

Stop the run immediately if any of:

- error rate > 2% for more than 2 minutes;
- p95 latency > 2 s for more than 3 minutes;
- database connection usage > 90%;
- more than 1 deadlock or 3 timeouts per minute;
- any 5xx on a write path;
- data integrity check fails (see below).

## Integrity checks after the run

```sql
select count(*) from event_registrations r
  join events e on e.id = r.event_id
 where e.capacity is not null and r.status = 'registered'
 group by e.id having count(*) > e.capacity;            -- must return 0 rows

select count(*) from (
  select user_id, event_id from event_registrations
   where status in ('registered','waitlisted','attended')
   group by 1,2 having count(*) > 1) duplicates;        -- must be 0

select count(*) from jobs where status = 'dead';        -- investigate any
```

## Bottleneck hypotheses

| Hypothesis | Why | How to confirm |
| --- | --- | --- |
| Neon connection ceiling | 4 services × pools | pool wait counts, provider metrics |
| Dynamic SSR per request | session-aware header | TTFB vs static asset latency |
| Fixed-window rate-limit upsert | one write per request | `pg_stat_statements` on `rate_limit_counters` |
| `ILIKE` search | no trigram index on long descriptions | search latency under load, `EXPLAIN` |
| Audit table growth | append-only, never pruned | table size, index bloat |

## Local baseline (not the plan above)

Run on 2026-10-18 against the **production build** (`next start`, single Node
process) with local PostgreSQL 16, no CDN, no page cache and no second instance.
Paths: `/`, `/clubs`, `/events`, `/projects`, `/search?q=robotics`,
`/api/health`, `/.well-known/security.txt`, in round-robin order, closed-loop
concurrency. Driver: `scripts/load.mjs` (Node `fetch`, same machine).

| Date | Concurrency | Duration | Requests | RPS | p50 | p95 | p99 | Max | Statuses |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-18 | 20 | 20 s | 2,803 | 139.8 | 170.0 ms | 230.2 ms | 264.6 ms | 384.3 ms | 200 × 2,803 |
| 2026-10-18 | 10 | 15 s | 2,458 | 163.6 | 69.1 ms | 101.7 ms | 134.4 ms | 174.2 ms | 200 × 2,458 |

What these numbers do **not** cover: concurrency above 20, authenticated writes,
the Rust API, the fallback API, Neon latency, multiple instances, cache
behaviour, or 30-minute endurance. Throughput at 10 VUs exceeded 20 VUs on this
shared sandbox, which is a sign the machine (not the app) is the limit — do not
read either row as capacity.

A second, invalid run is recorded here for honesty: starting `next start` with
the repository's development `.env` (`ALLOW_DEV_SIGN_IN=true`) makes every
page that touches configuration return 500. The guard is intentional; the
deployment must set production values and point its health check at
`/api/health/ready`.

## Results

The k6 scenarios remain unrun; that is the launch gate.

| Date | Environment | Scenario | VUs | RPS | p50 | p95 | p99 | Error rate | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | — | — | **not run** |
