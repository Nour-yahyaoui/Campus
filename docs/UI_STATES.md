# Loading, failure and retry — the UI contract

Three questions every page has to answer without being asked:

1. *Did my click register?* → the route progress bar, then the skeleton.
2. *Is it still working, or did it die?* → the skeleton keeps its shape; buttons
   show a spinner and `aria-busy`.
3. *What do I do now?* → the retry panel, with a reference and a countdown.

## The pieces

| Concern | Where |
| --- | --- |
| Route skeletons | `apps/web/app/**/loading.tsx` (25 routes) |
| Skeleton shapes | `apps/web/components/Skeletons.tsx` |
| Navigation bar | `apps/web/components/RouteProgress.tsx` |
| Failure + retry UI | `apps/web/components/RetryPanel.tsx` |
| Offline state | `apps/web/components/OfflineGate.tsx` |
| Error boundaries | `app/error.tsx`, `app/global-error.tsx`, `app/{dashboard,admin,observatory}/error.tsx` |
| Pending submit state | `components/SubmitButton.tsx` |
| Manual refresh | `components/RefreshButton.tsx` (Observatory) |

## Rules

- **The skeleton mirrors the real layout.** Same grid, same card heights, so
  nothing jumps when data arrives. `test/loading-states.test.ts` fails if a page
  has no loading boundary above it.
- **No fake content.** Blocks, never placeholder sentences. A skeleton that reads
  like content is a lie for the length of a slow query.
- **Announce, do not shout.** `role="status"`, `aria-busy="true"` and a
  visually hidden label. Respect `prefers-reduced-motion` (the sweep stops).
- **Delay the reveal.** Skeletons fade in after 80 ms, so a 40 ms response does
  not flash. Slow responses still get the feedback.
- **Retry has a budget.** The error panel retries automatically twice per
  session, then waits for a human. An outage must not turn into a request loop.
- **Failures are explicit.** The Observatory refuses to show zeros it did not
  measure; the error boundary says which surface failed and what was *not*
  changed (no moderation action was applied, your data is intact).

## Adding a route

1. Build the page.
2. Add `loading.tsx` next to `page.tsx`, using a shape from `Skeletons.tsx`. If
   the shape does not exist, add it there rather than inline — the test walks
   those files.
3. Run `npm test --workspace @campussphere/web`. The coverage test names the
   route you forgot.

## Testing it by hand

Throttle the network in DevTools ("Slow 3G") and click between `/clubs`,
`/events` and a detail page. You should see, in order: the progress bar, the
skeleton in the right shape, then the content — never a blank page and never the
browser's own spinner.

To see the retry dialog, stop the database and reload any listing page:

```bash
PG_BIN=… ./scripts/pg-local.sh stop     # then reload /clubs
PG_BIN=… ./scripts/pg-local.sh start    # and press "Try again"
```
