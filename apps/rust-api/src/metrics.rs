//! Process and host metrics for the operations dashboard.
//!
//! Everything here is read from `/proc` and the cgroup filesystem, so the
//! numbers describe the container that is actually running — not the host's
//! total capacity dressed up as if it were ours. When the kernel does not
//! expose a value (an unlimited cgroup, an old kernel) the field is `null`
//! rather than a guess.
//!
//! The endpoint that serves this is `/health/metrics`. It is intentionally
//! separate from `/health/live` so a cheap probe never pays for the `/proc`
//! reads. It is unauthenticated by design: the numbers describe a process, not
//! a person, and the operations dashboard has to be able to read them without a
//! second secret to keep in sync. Put the service behind a network you control
//! if you would rather they were not public.

use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

/// `SC_CLK_TCK` is 100 on every Linux architecture Rust supports. It is part
/// of the kernel ABI (`AT_CLKTCK`), not a tunable.
const CLOCK_TICKS_PER_SECOND: f64 = 100.0;

/// cgroup v1 reports "unlimited" as a page-aligned number close to 2^63.
const CGROUP_UNLIMITED_THRESHOLD: u64 = 1 << 50;

fn read(path: &str) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// Reads `Key:  1234 kB` from a proc file.
fn proc_kilobytes(path: &str, key: &str) -> Option<u64> {
    let text = read(path)?;
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix(key) {
            let value = rest.trim_start_matches(':').split_whitespace().next()?;
            return value.parse().ok();
        }
    }
    None
}

pub fn rss_bytes() -> Option<u64> {
    proc_kilobytes("/proc/self/status", "VmRSS").map(|kb| kb * 1024)
}

/// The high-water mark, which is what actually tells you whether a process has
/// been growing or has simply been alive for a while.
pub fn peak_rss_bytes() -> Option<u64> {
    proc_kilobytes("/proc/self/status", "VmHWM").map(|kb| kb * 1024)
}

pub fn host_memory_bytes() -> Option<u64> {
    proc_kilobytes("/proc/meminfo", "MemTotal").map(|kb| kb * 1024)
}

/// The container's memory limit, from cgroup v2 or v1.
pub fn memory_limit_bytes() -> Option<u64> {
    let raw = read("/sys/fs/cgroup/memory.max")
        .or_else(|| read("/sys/fs/cgroup/memory/memory.limit_in_bytes"))?;
    let value = raw.trim();
    if value.is_empty() || value == "max" {
        return None;
    }
    let bytes: u64 = value.parse().ok()?;
    if bytes >= CGROUP_UNLIMITED_THRESHOLD {
        return None;
    }
    Some(bytes)
}

/// User + system CPU time in clock ticks, from `/proc/self/stat`.
///
/// The second field (the executable name) can contain spaces and parentheses,
/// so the split happens after the *last* `)`.
fn cpu_ticks() -> Option<u64> {
    let text = read("/proc/self/stat")?;
    let end = text.rfind(')')?;
    let fields: Vec<&str> = text[end + 1..].split_whitespace().collect();
    let utime: u64 = fields.get(11)?.parse().ok()?;
    let stime: u64 = fields.get(12)?.parse().ok()?;
    Some(utime + stime)
}

pub fn cpu_seconds() -> Option<f64> {
    cpu_ticks().map(|ticks| ticks as f64 / CLOCK_TICKS_PER_SECOND)
}

static CPU_SAMPLE: OnceLock<Mutex<Option<(Instant, u64)>>> = OnceLock::new();

/// CPU used since the previous call, as a percentage of one core.
///
/// The first call after a restart has no interval to measure, so it returns
/// `None`; `percentAverage` covers that case until the second scrape.
pub fn cpu_percent() -> Option<f64> {
    let now = Instant::now();
    let ticks = cpu_ticks()?;
    let lock = CPU_SAMPLE.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().ok()?;

    let previous = *guard;
    let instant = previous.and_then(|(last_at, last_ticks)| {
        let elapsed = now.duration_since(last_at).as_secs_f64();
        if elapsed < 0.2 {
            return None;
        }
        let used = ticks.saturating_sub(last_ticks) as f64 / CLOCK_TICKS_PER_SECOND;
        Some(round2(used / elapsed * 100.0))
    });

    *guard = Some((now, ticks));
    instant
}

pub fn load_average() -> Option<(f64, f64, f64)> {
    let text = read("/proc/loadavg")?;
    let mut parts = text.split_whitespace();
    Some((
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    ))
}

pub fn cores() -> usize {
    std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(1)
}

/// Builds the document served at `/health/metrics`. `database` is assembled by
/// the caller because only it can run an async query.
pub fn snapshot(uptime_seconds: u64, database: Value) -> Value {
    let load = load_average();
    let instant = cpu_percent();
    let average = if uptime_seconds == 0 {
        None
    } else {
        cpu_seconds().map(|seconds| round2(seconds / uptime_seconds as f64 * 100.0))
    };

    json!({
        "service": "campussphere-rust-api",
        "status": "ok",
        "uptimeSeconds": uptime_seconds,
        "memory": {
            "rssBytes": rss_bytes(),
            "peakRssBytes": peak_rss_bytes(),
            "limitBytes": memory_limit_bytes(),
        },
        "cpu": {
            "percent": instant,
            "percentAverage": average,
            "cores": cores(),
            "load1": load.map(|value| round2(value.0)),
            "load5": load.map(|value| round2(value.1)),
            "load15": load.map(|value| round2(value.2)),
        },
        "host": {
            "memoryTotalBytes": host_memory_bytes(),
        },
        "database": database,
    })
}
