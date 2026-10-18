import { describe, expect, it } from "vitest";
import { classifyLoad, normalisePrimaryPayload } from "../src/load";

/**
 * The dashboard's honesty rules, enforced where they can be tested: a verdict
 * always names its trigger, and a missing measurement stays missing.
 */
describe("load verdicts", () => {
  it("reports unknown until there is something to measure", () => {
    const verdict = classifyLoad({ cpuLoadPercent: null });
    expect(verdict.level).toBe("unknown");
    expect(verdict.reason.length).toBeGreaterThan(10);
  });

  it("treats a waiting database pool as the most urgent signal", () => {
    const verdict = classifyLoad({ cpuLoadPercent: 2, poolWaiting: 3, p95Ms: 30 });
    expect(verdict.level).toBe("heavy");
    expect(verdict.reason).toContain("3 requests waiting");
  });

  it("escalates on CPU, event-loop stalls and latency", () => {
    expect(classifyLoad({ cpuLoadPercent: 91 }).level).toBe("heavy");
    expect(classifyLoad({ cpuLoadPercent: 5, eventLoopP99Ms: 180 }).level).toBe("heavy");
    expect(classifyLoad({ cpuLoadPercent: 5, p95Ms: 1_600 }).level).toBe("heavy");

    expect(classifyLoad({ cpuLoadPercent: 62 }).level).toBe("moderate");
    expect(classifyLoad({ cpuLoadPercent: 5, eventLoopP99Ms: 75 }).level).toBe("moderate");
    expect(classifyLoad({ cpuLoadPercent: 5, p95Ms: 900 }).level).toBe("moderate");

    expect(classifyLoad({ cpuLoadPercent: 24 }).level).toBe("light");
    expect(classifyLoad({ cpuLoadPercent: 2, p95Ms: 300 }).level).toBe("light");
  });

  it("says idle only with numbers, and quotes them", () => {
    const verdict = classifyLoad({ cpuLoadPercent: 4, eventLoopP99Ms: 3, p95Ms: 41 });
    expect(verdict.level).toBe("idle");
    expect(verdict.reason).toContain("CPU 4%");
    expect(verdict.reason).toContain("p95 41 ms");
  });
});

describe("primary metrics payload", () => {
  const payload = {
    service: "campussphere-rust-api",
    status: "ok",
    uptimeSeconds: 7_250,
    memory: { rssBytes: 48_234_496, peakRssBytes: 52_000_000, limitBytes: 536_870_912 },
    cpu: {
      percent: 12.5,
      percentAverage: 8,
      cores: 4,
      load1: 0.4,
      load5: 0.3,
      load15: 0.2,
    },
    host: { memoryTotalBytes: 8_589_934_592 },
    database: { ready: true, migrations: 7, latencyMs: 3 },
  };

  it("reads what the Rust service actually returns", () => {
    const metrics = normalisePrimaryPayload(payload);
    expect(metrics).not.toBeNull();
    expect(metrics?.version).toBeNull();
    expect(metrics?.uptimeSeconds).toBe(7_250);
    expect(metrics?.memory?.rssBytes).toBe(48_234_496);
    expect(metrics?.memory?.limitBytes).toBe(536_870_912);
    expect(metrics?.database).toEqual({ ready: true, migrations: 7, latencyMs: 3 });
  });

  it("turns CPU into a share of the capacity Actix can actually use", () => {
    const metrics = normalisePrimaryPayload(payload);
    // 12.5% of one core across four cores is 3.1% of the machine.
    expect(metrics?.cpu?.percent).toBe(12.5);
    expect(metrics?.cpu?.loadPercent).toBe(3.1);
    expect(metrics?.cpu?.cores).toBe(4);
  });

  it("never invents fields that were not sent", () => {
    const metrics = normalisePrimaryPayload({ service: "campussphere-rust-api" });
    expect(metrics).not.toBeNull();
    expect(metrics?.memory).toBeNull();
    expect(metrics?.cpu).toBeNull();
    expect(metrics?.database).toBeNull();
    expect(metrics?.uptimeSeconds).toBeNull();
  });

  it("rejects a document from something else", () => {
    expect(normalisePrimaryPayload({ service: "some-other-api" })).toBeNull();
    expect(normalisePrimaryPayload("not an object")).toBeNull();
    expect(normalisePrimaryPayload(null)).toBeNull();
  });
});
