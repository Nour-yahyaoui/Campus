# Rust diagnostics
## cargo generate-lockfile
`exit=0`
## cargo fmt --all (applied)
`exit=0`
## cargo build -p campussphere-api --message-format short
`exit=0`
```
[1m[92m  Downloaded[0m thiserror-impl v2.0.21
[1m[92m  Downloaded[0m thiserror v1.0.69
[1m[92m  Downloaded[0m thiserror-impl v1.0.69
[1m[92m  Downloaded[0m thiserror v2.0.21
[1m[92m   Compiling[0m thiserror v2.0.21
[1m[92m   Compiling[0m thiserror-impl v2.0.21
[1m[92m   Compiling[0m thiserror v1.0.69
[1m[92m   Compiling[0m thiserror-impl v1.0.69
```
## cargo clippy --message-format short
`exit=101`
```
apps/rust-api/src/main.rs:315:13: [1m[91merror[0m: this can be `std::io::Error::other(_)`
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
