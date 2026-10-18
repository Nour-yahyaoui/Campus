# Multi-stage build: compile with the full toolchain, run on a minimal distroless
# image as a non-root user. Cargo.lock is not committed yet, so the build
# resolves versions at build time; once CI commits the lock, copy it and switch
# to `cargo build --release --locked` for a reproducible image.
FROM rust:1.82-slim-bookworm AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml ./
COPY crates ./crates
COPY apps/rust-api ./apps/rust-api
COPY migrations ./migrations
RUN cargo build --release -p campussphere-api

FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=builder /build/target/release/campussphere-api /app/campussphere-api
ENV PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/campussphere-api"]
