# CampusSphere primary API (Rust + Actix Web).
#
# Build with THIS FOLDER as the context — everything the build needs is here:
#   docker build -t campussphere-rust-api apps/rust-api
#
# On Render that means:
#   Dockerfile Path: apps/rust-api/Dockerfile
#   Docker Context:  apps/rust-api
#
# The crate depends only on `crates/` next to it; nothing above this folder is
# read. `--locked` uses the committed Cargo.lock, so the image is reproducible.

FROM rust:1-slim-bookworm AS builder
WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY src ./src

RUN cargo build --release --locked -p campussphere-api

FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=builder /build/target/release/campussphere-api /app/campussphere-api
ENV PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/campussphere-api"]
