# Rust diagnostics
## cargo generate-lockfile
`exit=0`
## cargo fmt --all (applied)
`exit=0`
## cargo build -p campussphere-api --message-format short
`exit=101`
```
[1m[92m  Downloaded[0m thiserror-impl v1.0.69
[1m[92m  Downloaded[0m thiserror v1.0.69
[1m[92m  Downloaded[0m thiserror v2.0.21
[1m[92m  Downloaded[0m thiserror-impl v2.0.21
[1m[92m   Compiling[0m thiserror v2.0.21
[1m[92m   Compiling[0m thiserror-impl v2.0.21
[1m[92m   Compiling[0m thiserror v1.0.69
[1m[92m   Compiling[0m thiserror-impl v1.0.69
crates/application/src/lib.rs:343:9: [1m[91merror[E0433][0m: cannot find module or crate `tracing` in this scope: use of unresolved module or unlinked crate `tracing`
[1m[91merror[0m: could not compile `campussphere-application` (lib) due to 1 previous error
```
## cargo clippy --message-format short
`exit=101`
```
crates/application/src/lib.rs:343:9: [1m[91merror[E0433][0m: cannot find module or crate `tracing` in this scope: use of unresolved module or unlinked crate `tracing`
```
## cargo test
`exit=101`
```
```
