# Contributing

Thanks for taking a look. This is a small, opinionated project; the fastest way
to get a change merged is to keep it honest and tested.

## Before you start

- Open an issue for anything larger than a typo, so the approach can be agreed
  before code is written.
- Never include real personal data, university credentials, or production
  database dumps in an issue, test, or pull request.
- Security issues go through a private advisory, not a public issue
  (see [SECURITY.md](SECURITY.md)).

## Setup

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). You need Node 22+, PostgreSQL 16
and — only for the Rust crate — a Rust toolchain.

## What a good change looks like

1. **Server-side authorization.** Every mutation resolves the actor's role on the
   target object. A hidden button is not a control.
2. **Validation at the boundary.** New inputs get a zod schema in
   `packages/contracts`; SQL stays parameterised.
3. **A test that fails without the change.** Capacity, permissions and
   append-only behaviour are covered by integration tests; keep them that way.
4. **Honest copy.** Empty states explain what is missing. Do not add a counter
   that is not a query, a badge that is not measured, or a "coming soon" that has
   no plan.
5. **Accessibility.** Labels on every input, keyboard reachability, visible
   focus, no colour-only meaning, work at 320px.
6. **Migrations are append-only.** Never edit an applied file; add `000N_*.sql`.

## Commit and PR

- Conventional-ish subjects (`web: fix event timezone label`) are appreciated.
- Describe what you verified and what you did not. "Tests pass; Rust not built
  here" is a good pull request note.
- Include the commands you ran.
- Update `openapi/openapi.yaml`, `packages/contracts` and the Rust types when a
  wire contract changes.

## Code of conduct

Be civil and specific. Harassment, bigotry and doxxing are not welcome. The
maintainer may remove content or access to keep the project usable for students.
