# Rust diagnostics
## cargo generate-lockfile
`exit=0`
## cargo fmt --all (applied)
`exit=0`
## cargo build -p campussphere-api --message-format short
`exit=0`
```
[1m[92m  Downloaded[0m thiserror v1.0.69
[1m[92m  Downloaded[0m thiserror-impl v1.0.69
[1m[92m  Downloaded[0m thiserror v2.0.21
[1m[92m  Downloaded[0m thiserror-impl v2.0.21
[1m[92m   Compiling[0m thiserror v2.0.21
[1m[92m   Compiling[0m thiserror-impl v2.0.21
[1m[92m   Compiling[0m thiserror v1.0.69
[1m[92m   Compiling[0m thiserror-impl v1.0.69
```
## cargo clippy --message-format short
`exit=0`
```
```
## cargo test
`exit=0`
```
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
## docker build (repository root context)
`exit=1`
```
Dockerfile:17
--------------------
  15 |     COPY apps/rust-api ./apps/rust-api
  16 |     COPY migrations ./migrations
  17 | >>> RUN cargo build --release --locked -p campussphere-api
  18 |     
  19 |     FROM gcr.io/distroless/cc-debian12:nonroot
--------------------
ERROR: failed to build: failed to solve: process "/bin/sh -c cargo build --release --locked -p campussphere-api" did not complete successfully: exit code: 101
```
