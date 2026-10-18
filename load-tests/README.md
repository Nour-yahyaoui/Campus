# Load tests

The k6 scenarios in this directory have **not been executed** in this
workspace. See [`docs/LOAD_TEST_PLAN.md`](../docs/LOAD_TEST_PLAN.md) for the
target, method, abort criteria and the results table.

A separate, dependency-free baseline lives at `scripts/load.mjs`. It is *not*
the k6 plan: it runs against one process on one machine and only tells you
whether a build regressed. It has been run locally (2026-10-18) against the
production build; the numbers and their caveats are in the plan document.

```bash
# Install k6: https://k6.io/docs/get-started/installation/
k6 run load-tests/browse.js -e BASE_URL=https://staging.example.edu
k6 run load-tests/api.js    -e API_BASE_URL=https://api-staging.example.edu
```

Rules:

- Never point these at production.
- Seed a realistic corpus first; empty tables measure nothing.
- Record the raw JSON output and the commit SHA with every run.
- A run that aborts on an integrity check is a failed run, not a partial success.

## Local baseline

```bash
# Against a production build (`npm run build`, then `npm start`).
LOAD_BASE_URL=http://127.0.0.1:3000 LOAD_CONCURRENCY=20 LOAD_SECONDS=20 \
  node scripts/load.mjs
```

It exits non-zero if any response is a network error or 5xx, so it also works
as a post-deploy sanity check.
