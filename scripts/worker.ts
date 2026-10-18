/**
 * Durable job worker. Run as a separate process (`npm run worker`) in
 * production; it never needs to handle HTTP traffic.
 */
import { closePool, startWorkerLoop } from "../packages/core/src/index";

const worker = startWorkerLoop({
  onError: (error) => console.error("[worker]", error instanceof Error ? error.message : error),
});

console.log(`[worker] started ${worker.workerId}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, draining`);
  worker.stop();
  await closePool();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
