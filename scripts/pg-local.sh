#!/usr/bin/env bash
# Starts a local PostgreSQL 16 instance for development and tests.
# Uses the pgserver Python package's bundled binaries when a system install is
# unavailable (CI, sandboxes). Data lives outside the repository so it is
# never committed or captured in a workspace snapshot.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="${PGDATA:-${XDG_CACHE_HOME:-$HOME/.cache}/campussphere/pg}"
PORT="${PGPORT:-55432}"
SOCKET_DIR="${TMPDIR:-/tmp}/campussphere-pg-sock"

if [ -z "${PG_BIN:-}" ]; then
  if command -v initdb >/dev/null 2>&1; then
    PG_BIN="$(dirname "$(command -v initdb)")"
  else
    PG_BIN="$(python3 - <<'PY'
import os, pgserver
print(os.path.join(os.path.dirname(pgserver.__file__), "pginstall", "bin"))
PY
)"
  fi
fi

mkdir -p "$SOCKET_DIR" "$(dirname "$PGDATA")"

case "${1:-start}" in
  start)
    if [ -f "$PGDATA/PG_VERSION" ]; then
      if "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
        echo "already running on port $PORT"
        exit 0
      fi
    else
      "$PG_BIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 >/dev/null
    fi
    "$PG_BIN/pg_ctl" -D "$PGDATA" -o "-p $PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" \
      -l "$PGDATA.log" start >/dev/null
    for _ in $(seq 1 50); do
      "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PORT" -U postgres >/dev/null 2>&1 && break
      sleep 0.2
    done
    "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -tAc \
      "select 1 from pg_database where datname='campussphere'" | grep -q 1 || \
      "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres campussphere
    "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -tAc \
      "select 1 from pg_database where datname='campussphere_test'" | grep -q 1 || \
      "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres campussphere_test
    echo "postgres ready: postgresql://postgres@127.0.0.1:$PORT/campussphere"
    ;;
  stop)
    "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
    ;;
  *)
    echo "usage: $0 [start|stop]" >&2
    exit 1
    ;;
esac
