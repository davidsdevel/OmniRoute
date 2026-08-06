#!/usr/bin/env node
// BullMQ background worker entrypoint: `node bin/worker.mjs`.
// Owns the repeatable schedulers AND the per-queue workers for the 9 frequent
// background jobs. Run it as a separate process (or Deployment) from the
// Next.js server.
//
// Real runs need the tsx loader so tsconfig path aliases (`@/lib/...`) and the
// extensionless relative imports inside the TypeScript source resolve:
//   node --import tsx bin/worker.mjs
// Use `tsx` (both ESM + CJS hooks), NOT `tsx/esm` (ESM hooks only). The worker
// image's /app/package.json has no `"type": "module"`, so tsx compiles the .ts
// sources to CommonJS; their nested `require('@/...')` calls fall through to
// Node's plain CJS resolver, which knows nothing about tsconfig path aliases,
// and `--import tsx/esm` does not hook that path -> MODULE_NOT_FOUND.
// The empty-REDIS_URL guard below runs under plain Node so a misconfigured
// deployment exits cleanly (0) without a hang.

import "../open-sse/utils/setupPolyfill.ts";

const REDIS_URL = (process.env.REDIS_URL ?? "").trim();

if (!REDIS_URL) {
  // No Redis means the worker is useless. Exit 0 (not 1) so K8s does not
  // restart-loop on a configuration problem — an operator must fix REDIS_URL.
  console.warn("[worker] REDIS_URL not set — worker not started");
  process.exit(0);
}

const [{ startWorker }, { initQueues, scheduleRepeatableJobs }] = await Promise.all([
  import("../src/lib/background/workerBoot.ts"),
  import("../src/lib/background/queues.ts"),
]);

function redisHost(url) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

const SCHEDULE_TIMEOUT_MS = 15_000;

let workerHandle = null;
let queuesHandle = null;

try {
  queuesHandle = initQueues(REDIS_URL);
  workerHandle = await startWorker(REDIS_URL);
  console.log(
    `[worker] started (Redis ${redisHost(REDIS_URL)}, ${workerHandle.workers.length} queues, concurrency 1)`
  );

  // Register repeatable schedulers. Bound the wait so a slow Redis does not
  // delay worker startup; the upserts keep retrying in the background.
  await Promise.race([
    scheduleRepeatableJobs(queuesHandle),
    new Promise((resolve) => setTimeout(resolve, SCHEDULE_TIMEOUT_MS)),
  ]);
  console.log(
    `[worker] repeatable schedulers registered (${Object.keys(queuesHandle.queues ?? {}).length} queues)`
  );
} catch (error) {
  console.error("[worker] failed to start:", error?.message ?? error);
  process.exit(1);
}

async function shutdown(signal) {
  console.log(`[worker] ${signal} received — shutting down`);
  if (workerHandle) {
    try {
      await workerHandle.close();
    } catch (error) {
      console.warn("[worker] error closing workers:", error?.message ?? error);
    }
  }
  if (queuesHandle) {
    try {
      await queuesHandle.close();
    } catch (error) {
      console.warn("[worker] error closing queues:", error?.message ?? error);
    }
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
