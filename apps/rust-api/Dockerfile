# Multi-stage build: compile with the full toolchain, run on a minimal distroless
# image as a non-root user.
#
# The build context is the REPOSITORY ROOT, not this folder: the crate depends
# on the workspace crates in ../../crates. On Render, set
#   Dockerfile Path: apps/rust-api/Dockerfile
#   Docker Context:  .            (the repository root)
# Building with apps/rust-api as the context fails at the first COPY.
FROM rust:1-slim-bookworm AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY apps/rust-api ./apps/rust-api
COPY migrations ./migrations
RUN cargo build --release --locked -p campussphere-api

FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=builder /build/target/release/campussphere-api /app/campussphere-api
ENV PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/campussphere-api"]
